// Validates every article in content/seo/ against the contract that
// app/blog/[slug]/page.tsx and app/blog/page.tsx actually impose.
//
// The render contract, read off the code rather than assumed:
//   - app/blog/[slug]/page.tsx injects `post.bodyHtml` with
//     dangerouslySetInnerHTML into a plain <div className="article-body">.
//     Nothing sanitises it and nothing wraps it, so the stored string has to be
//     a complete, well-formed run of block-level elements on its own.
//   - The page already renders `post.title` as the one <h1>, so an article that
//     ships its own <h1> produces a second one.
//   - app/globals.css styles ONLY these inside .article-body: h2, h3, p, ul, ol,
//     li, a, strong, code, table, th, td, blockquote. Anything else renders
//     unstyled — a <pre> block, for instance, would run off the page.
//   - readingTime() strips tags with /<[^>]+>/g, so a literal ">" inside an
//     attribute value would corrupt the word count.
//
// Plus the product constraint: a Kodely article must not reference a remote
// host. The marketing site is not under the generated-site CSP, but shipping
// third-party requests from a page whose whole argument is "no external
// requests" is a bad look, and an <img> would be an unstyled full-bleed image.
//
// Usage:  node scripts/seo/validate.mjs [--quiet]

import { pathToFileURL } from "node:url";
import { loadArticles } from "./lib.mjs";

const QUIET = process.argv.includes("--quiet");

// Styled by .article-body in app/globals.css, plus the structural table
// elements those styles imply and <em> (browser default italic is fine).
const ALLOWED_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "code",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

// A body block must START with one of these — the article is a sequence of
// block-level elements, never a bare run of text.
const BLOCK_TAGS = new Set(["p", "h2", "h3", "ul", "ol", "blockquote", "table"]);

// Matches the board columns the blog index groups on.
const ALLOWED_CATEGORIES = new Set(["Guides", "Explainers", "Comparisons"]);

const TITLE_MAX = 60;
const META_MIN = 50;
const META_MAX = 160;

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\s*\/?>/g;
const ENTITY_RE = /&(?:[a-zA-Z][a-zA-Z0-9]{1,9}|#\d{1,6}|#x[0-9a-fA-F]{1,6});/g;

// Anything that would make the page fetch from, or point at, another origin.
const EXTERNAL_PATTERNS = [
  [/\bsrc\s*=/i, "src= attribute (no external or inline assets in article bodies)"],
  [/\bsrcset\s*=/i, "srcset attribute"],
  [/https?:\/\//i, "absolute http(s) URL"],
  [/(^|[^:])\/\/[a-z0-9-]+\.[a-z]{2,}/i, "protocol-relative URL"],
  [/url\s*\(/i, "CSS url()"],
  [/@import/i, "@import"],
  [/\bstyle\s*=/i, "inline style attribute"],
  [/\bon[a-z]+\s*=\s*["']/i, "inline event handler"],
];

/**
 * Walks the tag stream keeping a stack. Returns the list of structural
 * problems: unknown tags, mismatched closes, anything left open at the end.
 */
function checkStructure(html) {
  const problems = [];
  const stack = [];
  let match;
  TAG_RE.lastIndex = 0;

  while ((match = TAG_RE.exec(html)) !== null) {
    const [full, rawName] = match;
    const name = rawName.toLowerCase();
    const isClose = full.startsWith("</");
    const isSelfClosing = /\/>$/.test(full);

    if (name === "h1") {
      problems.push("<h1> is reserved for post.title, which the page renders itself");
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) {
      problems.push(`<${name}> is not styled by .article-body in app/globals.css`);
      continue;
    }
    if (isSelfClosing) {
      problems.push(`<${name} /> — self-closing tags are not used in article bodies`);
      continue;
    }

    if (isClose) {
      const open = stack.pop();
      if (open === undefined) {
        problems.push(`</${name}> closes a tag that was never opened`);
      } else if (open !== name) {
        problems.push(`</${name}> closes while <${open}> is still open`);
      }
    } else {
      stack.push(name);
    }
  }

  for (const open of stack.reverse()) {
    problems.push(`<${open}> is never closed`);
  }

  // Anything with a "<" that the tag regex could not consume is malformed
  // markup — a stray bracket, an unquoted attribute, a broken close.
  const stripped = html.replace(TAG_RE, "");
  if (stripped.includes("<")) {
    problems.push("a '<' remains after tag parsing — malformed markup");
  }
  if (stripped.includes(">")) {
    problems.push("a bare '>' in text — escape it as &gt; (readingTime strips on '>')");
  }

  // A bare "&" breaks in some feed/consumer contexts and is trivially avoided.
  const ampersands = stripped.replace(ENTITY_RE, "");
  if (ampersands.includes("&")) {
    problems.push("an unescaped '&' in text — write it as &amp;");
  }

  return problems;
}

function checkLinks(html, knownSlugs) {
  const problems = [];
  for (const match of html.matchAll(/<a\s+href="([^"]*)"/g)) {
    const href = match[1];
    if (!href.startsWith("/") && !href.startsWith("#")) {
      problems.push(`link "${href}" is not a root-relative or in-page link`);
      continue;
    }
    const blog = href.match(/^\/blog\/([a-z0-9-]+)$/);
    if (blog && !knownSlugs.has(blog[1])) {
      problems.push(`link "${href}" points at an article that is not in content/seo/`);
    }
  }
  for (const match of html.matchAll(/<a\b((?:[^>"]|"[^"]*")*)>/g)) {
    if (!/\shref="/.test(match[1])) {
      problems.push("an <a> without a quoted href");
    }
  }
  return problems;
}

function validate(article, seen, knownSlugs) {
  const problems = [];
  const warnings = [];
  const { slug, title, metaDescription, category, targetKeyword, bodyHtml, body } = article;

  // ── Identity ──────────────────────────────────────────────────────────
  if (typeof slug !== "string" || !slug) {
    problems.push("slug is missing");
  } else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      problems.push(`slug "${slug}" must be lowercase words joined by single hyphens`);
    }
    if (slug !== article.expectedSlug) {
      problems.push(`slug "${slug}" does not match its filename (${article.file})`);
    }
    if (seen.slugs.has(slug)) problems.push(`slug "${slug}" is used by another article`);
    seen.slugs.add(slug);
  }

  // ── Title ─────────────────────────────────────────────────────────────
  if (typeof title !== "string" || !title.trim()) {
    problems.push("title is missing");
  } else {
    if (title.length > TITLE_MAX) {
      problems.push(`title is ${title.length} chars (max ${TITLE_MAX}) — Google truncates past this`);
    }
    if (seen.titles.has(title)) problems.push(`title "${title}" is used by another article`);
    seen.titles.add(title);
  }

  // ── Meta description ──────────────────────────────────────────────────
  if (typeof metaDescription !== "string" || !metaDescription.trim()) {
    problems.push("metaDescription is missing");
  } else {
    const n = metaDescription.length;
    if (n < META_MIN || n > META_MAX) {
      problems.push(`metaDescription is ${n} chars (want ${META_MIN}-${META_MAX})`);
    }
    if (/<[a-z]/i.test(metaDescription)) {
      problems.push("metaDescription contains markup — it is rendered as plain text");
    }
    if (seen.metas.has(metaDescription)) {
      problems.push("metaDescription duplicates another article's");
    }
    seen.metas.add(metaDescription);
  }

  // ── Taxonomy ──────────────────────────────────────────────────────────
  if (!ALLOWED_CATEGORIES.has(category)) {
    problems.push(`category "${category}" is not one of: ${[...ALLOWED_CATEGORIES].join(", ")}`);
  }
  if (typeof targetKeyword !== "string" || !targetKeyword.trim()) {
    problems.push("targetKeyword is missing");
  } else if (targetKeyword !== targetKeyword.toLowerCase()) {
    problems.push("targetKeyword should be lowercase");
  }

  // ── Body ──────────────────────────────────────────────────────────────
  if (!Array.isArray(body) || body.length === 0) {
    problems.push("body must be a non-empty array of block-level HTML strings");
  } else {
    body.forEach((block, i) => {
      if (typeof block !== "string" || !block.trim()) {
        problems.push(`body[${i}] is empty`);
        return;
      }
      const opener = block.match(/^<([a-zA-Z][a-zA-Z0-9]*)[\s>]/);
      if (!opener || !BLOCK_TAGS.has(opener[1].toLowerCase())) {
        problems.push(`body[${i}] does not start with a block element (${block.slice(0, 40)}…)`);
      }
    });

    for (const [pattern, label] of EXTERNAL_PATTERNS) {
      if (pattern.test(bodyHtml)) problems.push(`body references ${label}`);
    }

    problems.push(...checkStructure(bodyHtml));
    problems.push(...checkLinks(bodyHtml, knownSlugs));

    const words = bodyHtml.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    if (words < 400) warnings.push(`only ${words} words — thin for a page meant to rank`);
    if (!/<h2[\s>]/.test(bodyHtml)) warnings.push("no <h2> — long pages need scannable headings");
    if (!/<a\s+href="\/signup"/.test(bodyHtml) && !/<a\s+href="\/pricing"/.test(bodyHtml)) {
      warnings.push("no link to /signup or /pricing");
    }
  }

  // An unknown or forbidden tag reports once per occurrence, which for a tag
  // used ten times is ten identical lines. De-duplicate — the fix is the same.
  return { problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
}

/**
 * Runs every check over every article on disk. Exported so the seeder can
 * refuse to write invalid content without shelling out to this file — one
 * implementation of the contract, two callers.
 */
export function validateAll(articles = loadArticles()) {
  const knownSlugs = new Set(articles.map((a) => a.slug));
  const seen = { slugs: new Set(), titles: new Set(), metas: new Set() };
  return articles.map((article) => ({
    article,
    ...validate(article, seen, knownSlugs),
  }));
}

function main() {
  const articles = loadArticles();
  if (articles.length === 0) {
    console.error("No articles found in content/seo/.");
    process.exit(1);
  }

  let failed = 0;
  let warned = 0;

  for (const { article, problems, warnings } of validateAll(articles)) {
    if (problems.length > 0) {
      failed++;
      console.error(`\nFAIL  ${article.file}`);
      for (const p of problems) console.error(`  - ${p}`);
      for (const w of warnings) console.error(`  ~ ${w}`);
    } else if (warnings.length > 0) {
      warned++;
      if (!QUIET) {
        console.log(`WARN  ${article.file}`);
        for (const w of warnings) console.log(`  ~ ${w}`);
      }
    } else if (!QUIET) {
      const words = article.bodyHtml.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
      console.log(`ok    ${article.slug}  (${article.title.length} char title, ${words} words)`);
    }
  }

  console.log(
    `\n${articles.length} articles — ${articles.length - failed} valid, ${failed} failing, ${warned} with warnings.`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

// Only when run directly — importing this from seed.mjs must not exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

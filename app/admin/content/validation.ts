// The render contract for a BlogPost body, enforced on the server.
//
// ── WHY THIS FILE IS AN ADAPTER AND NOT A RULE SET ────────────────────────
//
// scripts/seo/validate.mjs already encodes the contract that
// app/blog/[slug]/page.tsx imposes: the allowed tag set (.article-body styles
// only h2/h3/p/ul/ol/li/a/strong/code/table/th/td/blockquote), balanced tags,
// no <h1> because the page renders post.title as the only one, no external
// src/href, no inline style or event handler, no bare "<" / ">" / "&", title
// and metaDescription lengths, the category vocabulary, and the thin-content
// warnings. Twenty-odd checks, each one written against a line of the render
// code.
//
// A second copy of those rules living in the admin panel is the failure mode
// worth designing against: the two drift, and the one that drifts is the one
// deciding whether unsanitised markup reaches a public page. So this module
// IMPORTS validate.mjs and calls its exported `validateAll`. It contributes no
// checks of its own.
//
// It DOES contribute one transform, because the two callers hold the article in
// different shapes. validate.mjs is built for content/seo/*.json, where the body
// is an ARRAY of block-level HTML strings and `bodyHtml` is
// `body.join("\n")` (see scripts/seo/lib.mjs). The database stores only the
// joined string. `splitTopLevelBlocks` inverts that join so a database row can
// be handed to the validator unchanged — it re-derives the ARRAY, never the
// RULES. Verified against all 17 local rows: `splitTopLevelBlocks(bodyHtml)
// .join("\n") === bodyHtml.trim()` for every one.
//
// Importing an .mjs from scripts/ into a server module works because this file
// only ever runs on the server (it is imported by Server Components and by
// "use server" actions), validate.mjs's own `main()` is guarded behind an
// `import.meta.url === argv[1]` check that a bundled import never satisfies,
// and nothing here calls `loadArticles()` — the one export that touches the
// filesystem — since every article is passed in explicitly.

import { validateAll } from "@/scripts/seo/validate.mjs";

/** The six columns of BlogPost the validator judges. */
export type PostFields = {
  slug: string;
  title: string;
  metaDescription: string;
  category: string;
  targetKeyword: string;
  bodyHtml: string;
};

export type ValidationResult = {
  /** Refuses the save. */
  problems: string[];
  /** Advisory only — thin body, no <h2>, no CTA link. */
  warnings: string[];
};

export const EMPTY_RESULT: ValidationResult = { problems: [], warnings: [] };

// Same expression validate.mjs uses to walk the tag stream. Duplicated here for
// ONE purpose — finding where a top-level element ends so the body can be split
// back into blocks — and never to decide whether anything is allowed. If it and
// the validator's copy ever disagree, the consequence is a differently-grouped
// `body` array, not a differently-enforced rule.
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\s*\/?>/g;

/**
 * The inverse of `body.join("\n")` in scripts/seo/lib.mjs: one entry per
 * top-level element, in document order.
 *
 * Depth-counted rather than split on newlines, so a body an admin has
 * pretty-printed across several lines (a table, most likely) still yields one
 * block per element instead of a dozen fragments that would each be reported as
 * "does not start with a block element".
 *
 * Text sitting at depth zero is emitted as its own block precisely BECAUSE the
 * validator will then reject it — a bare run of prose outside any element is
 * exactly what the article contract forbids.
 */
export function splitTopLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  let match: RegExpExecArray | null;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html)) !== null) {
    const full = match[0];
    // A self-closing tag opens nothing. The validator rejects it separately;
    // here it must simply not unbalance the depth count.
    if (/\/>$/.test(full)) continue;

    if (full.startsWith("</")) {
      depth--;
      if (depth <= 0) {
        blocks.push(html.slice(start, match.index + full.length).trim());
        start = match.index + full.length;
        depth = 0;
      }
    } else {
      if (depth === 0) {
        const between = html.slice(start, match.index).trim();
        if (between) blocks.push(between);
        start = match.index;
      }
      depth++;
    }
  }

  const tail = html.slice(start).trim();
  if (tail) blocks.push(tail);
  return blocks;
}

/**
 * A database row in the shape `validate.mjs` expects of a file on disk.
 *
 * `file` and `expectedSlug` exist only to satisfy the filename checks, which
 * have no meaning for a row: setting `expectedSlug` to the slug itself makes
 * the "slug does not match its filename" check a tautology rather than a
 * spurious failure. Nothing else is faked.
 */
function toArticle(post: PostFields) {
  return {
    file: `${post.slug} (database row)`,
    expectedSlug: post.slug,
    slug: post.slug,
    title: post.title,
    metaDescription: post.metaDescription,
    category: post.category,
    targetKeyword: post.targetKeyword,
    body: splitTopLevelBlocks(post.bodyHtml),
    bodyHtml: post.bodyHtml,
  };
}

/** validate.mjs is plain JS, so its arrays arrive untyped. Pin them here. */
function toResult(entry: { problems: unknown[]; warnings: unknown[] }): ValidationResult {
  return {
    problems: entry.problems.map(String),
    warnings: entry.warnings.map(String),
  };
}

/**
 * Every post judged together, keyed by slug.
 *
 * Passed as one batch on purpose: three of the validator's checks — duplicate
 * slug, duplicate title, duplicate metaDescription — and its internal-link
 * check ("does /blog/x point at an article that exists?") are only meaningful
 * across the whole corpus. Validating rows one at a time would silently drop
 * four checks.
 *
 * Duplicate-detection reports the SECOND occurrence, so the order of `posts`
 * decides which of a colliding pair is flagged. That matches the CLI, which
 * orders by filename.
 */
export function validatePosts(posts: PostFields[]): Map<string, ValidationResult> {
  const out = new Map<string, ValidationResult>();
  for (const entry of validateAll(posts.map(toArticle))) {
    out.set(String(entry.article.slug), toResult(entry));
  }
  return out;
}

/**
 * One draft, judged against every other published post.
 *
 * The draft goes LAST so the corpus claims its own titles and descriptions
 * first — meaning a collision is reported against the row being edited, which
 * is the one the admin can actually do something about, rather than against
 * some unrelated post they cannot see from here.
 *
 * `others` must not contain the draft's own slug, or it collides with itself.
 */
export function validateDraft(draft: PostFields, others: PostFields[]): ValidationResult {
  const corpus = others.filter((p) => p.slug !== draft.slug);
  const results = validatePosts([...corpus, draft]);
  return results.get(draft.slug) ?? EMPTY_RESULT;
}

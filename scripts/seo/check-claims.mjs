// A claim linter for content/seo/*.json — and, optionally, for the live table.
//
//   node scripts/seo/check-claims.mjs                  lint the articles on disk
//   node scripts/seo/check-claims.mjs --db             lint every live BlogPost row too
//   node scripts/seo/check-claims.mjs --export-shipped treat zip export as deployed
//
// WHY THIS EXISTS SEPARATELY FROM validate.mjs
// validate.mjs checks the RENDER contract: is this well-formed markup that
// app/blog/[slug]/page.tsx can inject, is the title short enough, does the
// slug match the filename. Every one of its checks is about shape.
//
// Nothing checked shape when a post said an appointment form "collects the
// request and sends it to you". That article was perfectly well-formed. It was
// just false: there is no server behind a generated site, so nothing receives
// that request and nothing ever will. Shape validation cannot catch that, and
// "the writer will remember" is not a control.
//
// So this file encodes the product's actual limits as patterns, each one
// pointing at the source file that makes it true. It is deliberately noisy in
// one direction: it flags a phrase and asks a human to look, rather than
// trying to decide whether a sentence is an affirmative claim or a denial of
// one. Anything genuinely fine gets an entry in `allow`.
//
// Exit code is 1 if any ERROR fires, 0 otherwise. WARN never fails the run.

import { pathToFileURL } from "node:url";
import { loadArticles, loadEnv } from "./lib.mjs";

const ARGV = process.argv.slice(2);
const USE_DB = ARGV.includes("--db");
const EXPORT_SHIPPED = ARGV.includes("--export-shipped");

/**
 * Each rule: what to look for, how bad it is, and — the part that matters —
 * the file in this repo that decides the answer. A rule with no `source` is a
 * rule nobody can check, which is how the wrong claim got published in the
 * first place.
 */
const RULES = [
  {
    id: "per-build-credit-figure",
    level: "error",
    patterns: [
      /\b\d{2,4}\s*(?:-|–|—|to)\s*\d{2,4}\s*credits?\b/i,
      /(?:typical|typically|roughly|about|around|usually)[^.<]{0,60}\b\d{2,4}\s*credits?\b/i,
      /a (?:first |typical )?build[^.<]{0,40}\b\d{2,4}\s*credits?\b/i,
    ],
    message: "publishes a per-build credit figure",
    source:
      "lib/credits.ts estimateCredits(): the two measurements are ~144 and ~472 credits. Its own comment says two data points is not a distribution. Publish no number until the eval sweep produces percentiles.",
  },
  {
    id: "form-that-works",
    level: "error",
    patterns: [
      /(?:collects?|captures?|receives?)[^.<]{0,50}(?:and (?:sends?|emails?|delivers?) it to you)/i,
      /(?:gives you|builds?|generates?|get) a[^.<]{0,40}\bworking\b[^.<]{0,20}form/i,
      /form[^.<]{0,30}(?:sends?|emails?)[^.<]{0,20}(?:you|your inbox)/i,
      /submissions? (?:are |get )?(?:saved|stored|delivered|emailed)/i,
    ],
    message: "implies a form on a generated site receives or delivers submissions",
    source:
      "There is no backend behind a generated site (lib/foundation.ts ships react and react-dom only), so nothing can receive a submission. The working tree's lib/agent.ts also instructs the builder never to render a control that only pretends to work — not yet in HEAD, so today it may still draw one. Either way the article must not claim delivery. Use mailto:, tel:, or a link-out.",
  },
  {
    id: "multi-page",
    negationAware: true,
    level: "error",
    patterns: [
      /(?:generates?|builds?|turns that into|you get)[^.<]{0,40}multi-?page/i,
      /\bAdd an? [A-Z][a-z]+ page\b/,
      /(?:several|separate|distinct|its own) pages?\b(?![^.<]{0,40}(?:cannot|can't|isn't|is not|no ))/i,
    ],
    message: "implies more than one page",
    source:
      "lib/agent.ts SYSTEM: 'Multi-page: this is a single-page app. Build distinct sections/routes as components conditionally rendered or scrolled to, not separate .html files.'",
  },
  {
    id: "images",
    negationAware: true,
    level: "error",
    patterns: [
      /(?:upload|uploading)[^.<]{0,30}(?:photo|image|picture)/i,
      /(?:swap|replace|add)[^.<]{0,50}your own (?:real )?(?:photos|photography|images)/i,
      /placeholder (?:images|visuals|photos)/i,
      /(?:background|hero) image\b/i,
      /(?:use|add|include|pick|choose|insert|drop in)[^.<]{0,30}stock (?:photo|photography|image)/i,
    ],
    message: "implies photographic imagery or an upload path",
    source:
      "app/api/site/[slug]/[[...path]]/route.ts SANDBOX_CSP is img-src 'self' data: with connect-src 'none', and there is no upload route anywhere. lib/agent.ts: 'Images are inline SVG, CSS gradients, or data: URIs.'",
    allow: [/no stock (?:photo|photography)/i, /without stock (?:photo|photography)/i],
  },
  {
    id: "fonts",
    negationAware: true,
    level: "error",
    patterns: [/google fonts/i, /custom (?:web )?font/i, /@font-face/i],
    message: "implies a downloadable web font",
    source:
      "lib/agent.ts SYSTEM: the CSP sets no font-src, so fonts fall back to default-src 'self', which does not allow data: — a base64 font is blocked exactly like a remote one. System stack only.",
    allow: [/no (?:custom )?(?:web )?fonts?/i, /system font/i],
  },
  {
    id: "invented-facts",
    level: "warn",
    patterns: [
      /(?:real-sounding|plausible|sample|placeholder) testimonials?/i,
      /\b(?:three|four|3|4)[^.<]{0,20}testimonials\b/i,
      /invents?[^.<]{0,30}(?:reviews?|testimonials?|hours|prices)/i,
    ],
    message: "suggests asking the builder for testimonials or other business facts",
    source:
      "lib/agent.ts SYSTEM, 'Never invent facts about a real business': testimonials, review scores, staff names, hours, prices and addresses are all on the never-fabricate list. It writes a bracketed placeholder instead.",
  },
  {
    id: "custom-domain",
    negationAware: true,
    level: "error",
    patterns: [/(?:connect|point|use)[^.<]{0,30}your own domain\b(?![^.<]{0,40}(?:isn't|is not|not yet|no ))/i],
    message: "implies custom domain support",
    source: "Published sites are served at <slug>.<KODELY_SITES_BASE> only — see siteBaseUrl() in lib/site-seo.ts. There is no domain-binding route.",
  },
  {
    id: "backend",
    negationAware: true,
    level: "error",
    patterns: [
      /\b(?:generates?|builds?|includes?|comes with|wired to)\b[^.<]{0,30}\b(?:database|backend|user accounts?|authentication)\b/i,
      /(?:working|real|functioning)\s+(?:checkout|carts?|payments?)/i,
    ],
    message: "implies backend, auth, or payments",
    source:
      "lib/foundation.ts ships react and react-dom only, and lib/agent.ts refuses to add dependencies or write config. There is no server in a generated site.",
  },
  {
    id: "export",
    negationAware: true,
    level: EXPORT_SHIPPED ? "off" : "error",
    patterns: [
      /(?:download|export)[^.<]{0,40}(?:as a )?zip/i,
      /Download \.zip/i,
      /zip (?:download|export)/i,
    ],
    message: "claims a zip download exists",
    source:
      "app/api/projects/[id]/export/route.ts and lib/zip.ts are UNTRACKED in git — built, not deployed. Re-run with --export-shipped once they are live.",
    allow: [
      /(?:no|not|isn't|is not|aren't)[^.<]{0,40}(?:zip|export|download)/i,
      /(?:zip|export|download)[^.<]{0,30}(?:isn't|is not|not available|not yet)/i,
    ],
  },
];

// Most of these rules describe a capability the product does NOT have, which
// means the honest articles — the ones whose whole subject is that limit —
// contain the exact words the rule looks for. "There are no stock photos" and
// "add your own stock photos" differ by one negation and nothing else.
//
// So rules marked `negationAware` are suppressed when a negation cue sits in
// the run of text immediately before the match. It is a blunt instrument and
// it will occasionally suppress a real problem — which is why the rules where
// a false negative would be expensive (a published credit figure, a form that
// claims to deliver mail) are NOT negation-aware, and fire regardless.
const NEGATION =
  /\b(?:no|none|neither|not|never|cannot|can't|won't|isn't|aren't|doesn't|don't|without|instead of|rather than|there's no|lacks?|rules? out|blocks?|impossible|better than|nothing)\b[^.<]{0,60}$/i;

/** Every rule hit in one body, with enough context for a human to judge it. */
function lint(body) {
  const findings = [];
  for (const rule of RULES) {
    if (rule.level === "off") continue;
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
      let m;
      while ((m = re.exec(body)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const from = Math.max(0, m.index - 110);
        const before = body.slice(from, m.index).replace(/<[^>]+>/g, " ");
        const window = body.slice(from, m.index + m[0].length + 110);
        if ((rule.allow ?? []).some((a) => a.test(window))) continue;
        if (rule.negationAware && NEGATION.test(before)) continue;
        findings.push({
          rule,
          quote: `…${window.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}…`,
        });
        break; // one finding per rule per article is enough to send someone looking
      }
    }
  }
  return findings;
}

async function bodies() {
  const out = loadArticles().map((a) => ({ where: `content/seo/${a.file}`, body: a.bodyHtml }));
  if (!USE_DB) return out;

  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("--db was passed but DATABASE_URL is not set.");
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    const onDisk = new Set(out.map((o) => o.where));
    const rows = await db.blogPost.findMany({ select: { slug: true, bodyHtml: true } });
    for (const row of rows) {
      const where = `db:${row.slug}`;
      if (onDisk.has(`content/seo/${row.slug}.json`)) continue; // same content, already linted
      out.push({ where, body: row.bodyHtml });
    }
  } finally {
    await db.$disconnect();
  }
  return out;
}

async function main() {
  const targets = await bodies();
  let errors = 0;
  let warnings = 0;

  for (const { where, body } of targets) {
    const findings = lint(body);
    if (findings.length === 0) continue;
    console.log(`\n${where}`);
    for (const { rule, quote } of findings) {
      const tag = rule.level === "error" ? "ERROR" : "warn ";
      if (rule.level === "error") errors++;
      else warnings++;
      console.log(`  ${tag} [${rule.id}] ${rule.message}`);
      console.log(`        ${quote.slice(0, 240)}`);
      console.log(`        ground truth: ${rule.source}`);
    }
  }

  console.log(
    `\n${targets.length} article(s) checked — ${errors} error(s), ${warnings} warning(s).`,
  );
  if (!EXPORT_SHIPPED) {
    console.log(
      "The `export` rule assumes the zip export is NOT deployed. Pass --export-shipped after it is.",
    );
  }
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { RULES, lint };

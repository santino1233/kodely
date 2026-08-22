// Deterministic scoring of one generated site. No model call, no network.
//
// Every check here is cheap, repeatable and answers a question someone would
// actually ask about a shipped page. The bar for including a check was: could
// this fail on a real generation, and would a human agree that failing it is
// worse? Anything that came down to taste was left out — taste needs a judge,
// and a judge is a different, more expensive instrument than this one.
//
// Checks return one of:
//   "pass" / "fail" — counted in the score
//   "skip"          — not applicable to this fixture, excluded from the
//                     denominator (e.g. the html-lang check only runs on a
//                     fixture that declares an expected language)
//   "error"         — the input needed for the check was missing (usually
//                     because the build failed), counted as a fail so a broken
//                     build never scores well by omission.

/** Rough guide only — see MODEL_RATES in lib/models.ts for the real card. */
export function costMicros(rates, model, usage) {
  // Deliberately duplicated from lib/credits.ts rather than imported: that
  // module instantiates Prisma at module scope, and this harness must never
  // open a connection to the application database. Keep the arithmetic in sync
  // with costMicros() there — MODEL_RATES is USD per MILLION tokens, which is
  // numerically already micro-dollars per token, so there is no /1e6.
  const rate = rates[model] ?? rates.default;
  return Math.round(
    rate.input * (usage.inputTokens ?? 0) +
      rate.output * (usage.outputTokens ?? 0) +
      rate.cacheRead * (usage.cacheReadTokens ?? 0) +
      rate.cacheWrite * (usage.cacheWriteTokens ?? 0),
  );
}

/** One credit = $0.002 of model spend. Mirrors MICROS_PER_CREDIT in lib/credits.ts. */
export const MICROS_PER_CREDIT = 2_000;
// Must stay identical to creditsFor() in lib/credits.ts — this harness exists
// to report what a build WOULD be charged, so any divergence makes every cost
// figure it prints a lie. The zero case is deliberate and load-bearing: a build
// with no metered telemetry (common on the SDK engine) costs nothing and must
// therefore charge nothing.
export const creditsFor = (micros) =>
  micros <= 0 ? 0 : Math.max(1, Math.ceil(micros / MICROS_PER_CREDIT));

export const CHECK_IDS = [
  "title",
  "meta-description",
  "og-tags",
  "no-placeholder-text",
  "no-external-requests",
  "responsive",
  "component-count",
  "html-lang",
];

const FOUNDATION_TITLE = "Kodely Site";

// ── small HTML helpers (regex, not a parser — the input is vite's own output) ──

function textOfTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html ?? "");
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** Reads a meta tag's content by name= or property=, in either attribute order. */
function metaContent(html, key) {
  const re = new RegExp(`<meta\\b[^>]*?\\b(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html ?? "")?.[0];
  if (!tag) return null;
  const c = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag) ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag);
  return c ? c[1].trim() : null;
}

function htmlLang(html) {
  const m = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html ?? "");
  return m ? m[1].trim().toLowerCase() : null;
}

const byExt = (files, ext) =>
  Object.entries(files ?? {}).filter(([p]) => p.toLowerCase().endsWith(ext));

// ── the checks ────────────────────────────────────────────────────────────────

function checkTitle(ctx) {
  const title = textOfTitle(ctx.indexHtml);
  if (!ctx.indexHtml) return { status: "error", detail: "no dist/index.html (build failed?)" };
  if (!title) return { status: "fail", detail: "no <title> element" };
  if (title === FOUNDATION_TITLE) {
    return { status: "fail", detail: `left the foundation placeholder "${FOUNDATION_TITLE}"` };
  }
  if (title.length < 3) return { status: "fail", detail: `title too short: "${title}"` };
  if (title.length > 70) return { status: "fail", detail: `title ${title.length} chars (aim under ~60)` };
  return { status: "pass", detail: `"${title}" (${title.length} chars)` };
}

// 50-200 chars is the window where a description is a real sentence about the
// business and still survives a search result without truncation. Outside it,
// it is either missing-in-practice or an essay.
function checkMetaDescription(ctx) {
  if (!ctx.indexHtml) return { status: "error", detail: "no dist/index.html (build failed?)" };
  const desc = metaContent(ctx.indexHtml, "description");
  if (!desc) return { status: "fail", detail: "no meta description" };
  if (desc.length < 50) return { status: "fail", detail: `only ${desc.length} chars` };
  if (desc.length > 200) return { status: "fail", detail: `${desc.length} chars (over 200)` };
  return { status: "pass", detail: `${desc.length} chars` };
}

function checkOgTags(ctx) {
  if (!ctx.indexHtml) return { status: "error", detail: "no dist/index.html (build failed?)" };
  const title = metaContent(ctx.indexHtml, "og:title");
  const desc = metaContent(ctx.indexHtml, "og:description");
  const missing = [];
  if (!title) missing.push("og:title");
  if (!desc) missing.push("og:description");
  if (missing.length) return { status: "fail", detail: `empty: ${missing.join(", ")}` };
  if (title === FOUNDATION_TITLE) return { status: "fail", detail: "og:title is the placeholder" };
  return { status: "pass", detail: "og:title and og:description set" };
}

const PLACEHOLDER_PATTERNS = [
  [/lorem\s+ipsum/i, "Lorem ipsum"],
  [/dolor\s+sit\s+amet/i, "lorem filler"],
  [/your\s+(title|name|headline|text|logo|company|business|tagline)\s+here/i, "'Your ... here'"],
  [/\b(headline|text|content|description)\s+goes\s+here\b/i, "'... goes here'"],
  [/\bplaceholder\s+(text|content|copy)\b/i, "'placeholder text'"],
  [/\binsert\s+(your|text|content)\b/i, "'insert ...'"],
  [/\bsample\s+(text|content|heading)\b/i, "'sample text'"],
  [/\bKodely\s+Site\b/, "the foundation placeholder title"],
  [/\bTODO\b/, "a TODO left in the output"],
];

const COMING_SOON = /\bcoming\s+soon\b/i;

function checkPlaceholderText(ctx) {
  // Source is scanned as well as dist because a placeholder inside a component
  // that happens to be conditionally rendered still ships to the customer.
  const haystacks = [
    ...byExt(ctx.dist, ".html"),
    ...Object.entries(ctx.source).filter(([p]) => /\.(tsx|jsx|html|css|md)$/i.test(p)),
  ];
  if (!haystacks.length) return { status: "error", detail: "nothing to scan" };

  const hits = [];
  for (const [path, content] of haystacks) {
    for (const [re, label] of PLACEHOLDER_PATTERNS) {
      if (re.test(content)) hits.push(`${label} in ${path}`);
    }
    // "Coming soon" is only a defect when nobody asked for it. A coming-soon
    // page that says "coming soon" is the correct answer, and a rubric that
    // marks it wrong would push the prompt in exactly the wrong direction.
    if (!ctx.allowComingSoon && COMING_SOON.test(content)) {
      hits.push(`"coming soon" in ${path} (not requested)`);
    }
  }
  const unique = [...new Set(hits)];
  return unique.length
    ? { status: "fail", detail: unique.slice(0, 4).join("; ") }
    : { status: "pass", detail: "no placeholder copy found" };
}

// Correctness, not style: the published CSP blocks every external host, so any
// of these silently fails to load on the live site.
const EXTERNAL_HTML_PATTERNS = [
  [/<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, "<script src=http>"],
  [/<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i, "<link href=http>"],
  [/<img\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, "<img src=http>"],
  [/<iframe\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, "<iframe src=http>"],
  [/<(?:source|video|audio|track)\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, "<media src=http>"],
];
const EXTERNAL_CSS_PATTERNS = [
  [/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i, "@import from a remote host"],
  [/url\(\s*["']?(?:https?:)?\/\/(?!localhost)/i, "css url() to a remote host"],
];
// JSX equivalents. Deliberately does NOT flag <a href="https://..."> — an
// outbound hyperlink is not a request the page makes, and the band and shop
// fixtures legitimately link out.
const EXTERNAL_JSX_PATTERNS = [
  [/\bsrc\s*=\s*\{?\s*["'`](?:https?:)?\/\//i, "src= pointing at a remote host"],
  [/\bsrcSet\s*=\s*\{?\s*["'`](?:https?:)?\/\//i, "srcSet pointing at a remote host"],
  [/\bfetch\s*\(\s*["'`](?:https?:)?\/\//i, "fetch() to a remote host"],
  [/fonts\.(googleapis|gstatic)\.com/i, "Google Fonts"],
];

function checkExternalRequests(ctx) {
  const hits = [];
  const scan = (entries, patterns) => {
    for (const [path, content] of entries) {
      for (const [re, label] of patterns) {
        const m = re.exec(content);
        if (m) hits.push(`${label} in ${path}`);
      }
    }
  };

  const htmlEntries = [...byExt(ctx.dist, ".html")];
  if (ctx.source["index.html"]) htmlEntries.push(["index.html (source)", ctx.source["index.html"]]);
  scan(htmlEntries, EXTERNAL_HTML_PATTERNS);
  scan([...byExt(ctx.dist, ".css"), ...byExt(ctx.source, ".css")], EXTERNAL_CSS_PATTERNS);
  // Bundled JS is not scanned: React ships documentation URLs in its own error
  // strings, which would be a permanent false positive. The JSX source is the
  // honest place to look for a remote asset the agent wrote.
  scan(
    Object.entries(ctx.source).filter(([p]) => /\.(tsx|jsx|ts|js)$/i.test(p)),
    EXTERNAL_JSX_PATTERNS,
  );

  const unique = [...new Set(hits)];
  return unique.length
    ? { status: "fail", detail: unique.slice(0, 4).join("; ") }
    : { status: "pass", detail: "no external asset requests" };
}

const BREAKPOINT_CLASS = /\b(sm|md|lg|xl|2xl):[a-z[]/;
const WIDTH_MEDIA_QUERY = /@media[^{]*\((?:min|max)-width/i;

function checkResponsive(ctx) {
  // A width-based media query, specifically: Tailwind's preflight emits
  // @media (hover: hover) unconditionally, so a bare "@media" test would pass
  // even for a page with no responsive work at all.
  const css = byExt(ctx.dist, ".css").map(([, c]) => c).join("\n");
  if (WIDTH_MEDIA_QUERY.test(css)) {
    return { status: "pass", detail: "width-based media queries in the compiled CSS" };
  }
  const sourceHit = Object.entries(ctx.source).find(
    ([p, c]) => /\.(tsx|jsx)$/i.test(p) && BREAKPOINT_CLASS.test(c),
  );
  if (sourceHit) {
    return { status: "pass", detail: `Tailwind breakpoint classes (${sourceHit[0]})` };
  }
  if (!css && !Object.keys(ctx.source).length) {
    return { status: "error", detail: "no CSS or source to inspect" };
  }
  return { status: "fail", detail: "no width media queries and no breakpoint classes" };
}

function checkComponentCount(ctx) {
  // Counts components the AGENT wrote. The foundation already ships four UI
  // primitives under src/components/ui/, so a naive count of that directory
  // would pass for a site that is one giant App.tsx — which is the exact
  // failure this check exists to catch.
  const authored = Object.keys(ctx.source).filter(
    (p) =>
      /^src\/.+\.(tsx|jsx)$/i.test(p) &&
      p !== "src/main.tsx" &&
      p !== "src/App.tsx" &&
      !ctx.foundationPaths.has(p),
  );
  const appLines = (ctx.source["src/App.tsx"] ?? "").split("\n").length;
  const detail = `${authored.length} authored component file(s), App.tsx ${appLines} lines`;
  if (!Object.keys(ctx.source).length) return { status: "error", detail: "no source files" };
  return authored.length > 1 ? { status: "pass", detail } : { status: "fail", detail };
}

function checkHtmlLang(ctx) {
  if (!ctx.expectLang) return { status: "skip", detail: "no expected language for this fixture" };
  if (!ctx.indexHtml) return { status: "error", detail: "no dist/index.html (build failed?)" };
  const lang = htmlLang(ctx.indexHtml);
  if (!lang) return { status: "fail", detail: "no lang attribute on <html>" };
  const ok = lang === ctx.expectLang || lang.startsWith(`${ctx.expectLang}-`);
  return ok
    ? { status: "pass", detail: `lang="${lang}"` }
    : { status: "fail", detail: `lang="${lang}", expected "${ctx.expectLang}"` };
}

const CHECKS = {
  title: checkTitle,
  "meta-description": checkMetaDescription,
  "og-tags": checkOgTags,
  "no-placeholder-text": checkPlaceholderText,
  "no-external-requests": checkExternalRequests,
  responsive: checkResponsive,
  "component-count": checkComponentCount,
  "html-lang": checkHtmlLang,
};

/**
 * @param {object} args
 * @param {Record<string,string>} args.source  final source FileMap
 * @param {Record<string,string>|null} args.dist compiled output, or null if the build failed
 * @param {object} args.fixture the fixture entry from prompts.json
 * @param {Set<string>} args.foundationPaths paths shipped by lib/foundation.ts
 */
export function scoreSite({ source, dist, fixture, foundationPaths }) {
  const ctx = {
    source: source ?? {},
    dist: dist ?? {},
    indexHtml: dist?.["index.html"] ?? null,
    foundationPaths: foundationPaths ?? new Set(),
    expectLang: fixture?.expect?.lang ?? null,
    allowComingSoon:
      Boolean(fixture?.expect?.allowComingSoon) ||
      /coming\s+soon|launch(?:ing)?\s+soon/i.test(fixture?.prompt ?? ""),
  };

  const checks = CHECK_IDS.map((id) => {
    let result;
    try {
      result = CHECKS[id](ctx);
    } catch (err) {
      result = { status: "error", detail: `check threw: ${err?.message ?? err}` };
    }
    return { id, status: result.status, detail: result.detail };
  });

  // Nothing compiled means nothing shipped, so nothing passed. Several checks
  // read the source rather than the build output and would otherwise award
  // credit "by absence" — no placeholder copy in a page that does not exist is
  // not an achievement, and a fixture that stops compiling must show up as a
  // full regression rather than a 25%. The original detail is preserved so the
  // per-check output is still usable for diagnosis.
  if (!ctx.indexHtml) {
    for (const c of checks) {
      if (c.status === "skip") continue;
      c.status = "error";
      c.detail = `build produced no index.html; ${c.detail}`;
    }
  }

  const applicable = checks.filter((c) => c.status !== "skip");
  const passed = applicable.filter((c) => c.status === "pass").length;

  return {
    checks,
    passed,
    applicable: applicable.length,
    score: applicable.length ? Number((passed / applicable.length).toFixed(4)) : 0,
  };
}

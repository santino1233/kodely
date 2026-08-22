// SEO for PUBLISHED sites (served by app/api/site/[slug]/...).
//
// Why any of this exists at serve time rather than purely in generation:
// the builder prompt is told to fill in index.html's <head>, but a prompt is
// guidance, not a guarantee. Everything here is a backstop that runs on the
// way out, so a site can never be published with the foundation's placeholder
// title — which is exactly what shipped before (every site was "Kodely Site",
// in the browser tab, in Google, and in every link preview).
//
// It also fixes ALREADY-published sites with no regeneration, because it
// rewrites on read rather than at build time.

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// The foundation's placeholder. If this survives to serve time the agent
// didn't personalise the head, so we substitute the real project name.
const PLACEHOLDER_TITLE = "Kodely Site";

/**
 * Public base URL of a published site, as a visitor sees it.
 *
 * Two shapes, because the proxy rewrites the branded subdomain onto an
 * internal path:
 *   <slug>.kodely.site/         -> internally /api/site/<slug>
 *   staging.kodely.me/api/site/<slug>/   (no wildcard DNS off prod)
 *
 * Canonical/OG URLs must use the EXTERNAL form or they point somewhere the
 * visitor's browser never went, so this keys off the Host header.
 */
export function siteBaseUrl(req: Request, slug: string): string {
  const host = req.headers.get("host") ?? "";
  const bare = host.split(":")[0];

  // Deliberately NOT derived from x-forwarded-proto. Cloudflare's SSL mode
  // here is Flexible: it terminates TLS at the edge and talks to the origin
  // over plain HTTP, so nginx forwards `x-forwarded-proto: http` even though
  // the visitor is on https. Trusting it emitted http:// canonical and og:url
  // on sites that are only reachable over https.
  //
  // That was invisible in testing because Cloudflare's Automatic HTTPS
  // Rewrites silently repairs href="http://..." (canonical) but NOT
  // content="http://..." (og:url) — so only the OG tag stayed wrong, and
  // only when checked through the real edge.
  //
  // Every published site is reachable only via the Cloudflare HTTPS edge, so
  // anything that isn't loopback is https by definition.
  const isLocal = bare === "localhost" || bare === "127.0.0.1" || bare === "::1";
  const proto = isLocal ? "http" : "https";
  // Branded subdomain: the site lives at the host root.
  if (bare.endsWith(`.${SITES_BASE}`)) return `${proto}://${host}`;
  // Otherwise it is served under a path (staging, localhost).
  return `${proto}://${host}/api/site/${slug}`;
}

/**
 * The public URL of ONE built HTML file — the single definition of a page's
 * address.
 *
 * Sites are multi-page now (see lib/foundation.ts): `vite build` emits one real
 * document per page, and the site route serves `about.html` for a request to
 * `/about`. Three things have to agree on what a page's address IS — its
 * <link rel="canonical">, its og:url, and its <loc> in sitemap.xml — and they
 * agree by all coming from here. A sitemap advertising /about while the page at
 * /about canonicalises elsewhere is a self-cancelling instruction: Google drops
 * the URL rather than guessing which half to believe.
 *
 * Extensionless is the canonical form, so /about and /about.html — the route
 * answers both — collapse onto one indexable URL instead of competing as two.
 */
export function pageUrl(baseUrl: string, htmlPath: string): string {
  return baseUrl.replace(/\/$/, "") + pagePath(htmlPath);
}

/** "index.html" -> "", "about.html" -> "/about", "blog/index.html" -> "/blog". */
function pagePath(htmlPath: string): string {
  const stripped = htmlPath
    .replace(/^\/+/, "")
    .replace(/\.html?$/i, "")
    // A directory index IS the directory: blog/index.html is /blog, and a bare
    // index at the root is the site root itself.
    .replace(/(^|\/)index$/i, "$1")
    .replace(/\/+$/, "");
  return stripped ? `/${stripped}` : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(s: string): string {
  return escapeHtml(s).replace(/'/g, "&apos;");
}

/**
 * Undo the entity encoding in text pulled back OUT of the HTML.
 *
 * The title is read from inside <title>…</title>, where it is already encoded —
 * a site called "Bloom & Co" is stored as "Bloom &amp; Co". Composing the
 * fallback description from that string and then escaping it again produced
 * "Bloom &amp;amp; Co", and the literal entity showed up in every link preview.
 * Decoding first, then escaping once, is the round trip that holds.
 *
 * Only the five entities escapeHtml/escapeXml can produce. A general HTML
 * entity decoder is not wanted here: this exists purely to invert our own
 * escaping, and anything else the builder wrote should pass through untouched.
 */
function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand LAST, so "&amp;lt;" decodes to "&lt;" rather than "<".
    .replace(/&amp;/g, "&");
}

/** Absolutise a root-relative URL against the site's public base. */
function absolutise(value: string, base: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `${base.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}

/**
 * Ensure a served HTML document has a real title, a description, canonical
 * and OG/Twitter tags. Only fills gaps — anything the builder already wrote
 * is left exactly as-is, since it had the site's actual content in view and
 * this function does not.
 */
export function applySeo(
  html: string,
  opts: {
    projectName: string;
    baseUrl: string;
    /**
     * This page's own URL, from pageUrl() — what canonical and og:url describe.
     *
     * MULTI-PAGE DEPENDS ON THIS. Both used to be `baseUrl`, which was correct
     * while every site was one page and actively harmful the moment one is not:
     * every subpage would have declared the HOME PAGE as its canonical, which
     * is not a hint, it is an instruction to drop /about, /services and /contact
     * from the index entirely. Multi-page exists FOR the extra indexable pages,
     * so shipping it without this would have shipped the opposite of the point.
     *
     * Defaults to baseUrl, which is the right answer for a single-page site.
     */
    pageUrl?: string;
  },
): string {
  const { projectName, baseUrl } = opts;
  const selfUrl = opts.pageUrl ?? baseUrl;
  if (!/<head[\s>]/i.test(html)) return html; // not a full document; leave alone

  let out = html;

  // 1. Title — replace the placeholder, or add one if missing entirely.
  const titleMatch = out.match(/<title>([\s\S]*?)<\/title>/i);
  const currentTitle = titleMatch?.[1]?.trim();
  const title = !currentTitle || currentTitle === PLACEHOLDER_TITLE ? projectName : currentTitle;
  // Replacements go through FUNCTIONS, never strings. In a string replacement
  // `$` is a substitution sigil — `$&`, `` $` ``, `$'` and `$1` are expanded,
  // and escapeHtml does not escape `$`. A project called "Everything $1 Store"
  // silently lost the `$1`, and a value containing `` $` `` spliced the entire
  // preceding document into the tag. applySeo runs on every read of every
  // published site, so this was live on the serving path.
  if (titleMatch) {
    if (currentTitle !== title) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
    }
  } else {
    out = out.replace(
      /<head([^>]*)>/i,
      (_m, attrs: string) => `<head${attrs}>\n    <title>${escapeHtml(title)}</title>`,
    );
  }

  const inject: string[] = [];

  // Upsert a <meta>/<link>: fill it when the tag is absent OR present with an
  // empty value. The foundation ships empty `content=""` scaffolding to show
  // the builder what to write, so "tag exists" alone is not good enough — an
  // existence-only check would leave those empty forever.
  const upsert = (attrRe: RegExp, valueAttr: "content" | "href", value: string, tag: string) => {
    const existing = out.match(attrRe);
    if (!existing) {
      inject.push(tag);
      return;
    }
    const valRe = new RegExp(`${valueAttr}=["']([^"']*)["']`, "i");
    const current = existing[0].match(valRe)?.[1];
    if (current === undefined || current.trim() === "") {
      // Replacer function, not a string — see the note above the title block.
      out = out.replace(existing[0], () => tag);
    }
  };

  // decodeHtml first: `title` may have come straight out of <title>…</title>,
  // where it is already escaped. Without this, escapeHtml below double-encodes
  // it and the raw entity is what people see in the link preview.
  const desc = `${decodeHtml(title)} — built with Kodely.`;
  upsert(
    /<meta\s+name=["']description["'][^>]*>/i,
    "content",
    desc,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
  );
  upsert(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    "href",
    selfUrl,
    `<link rel="canonical" href="${escapeHtml(selfUrl)}" />`,
  );
  // decodeHtml for the same reason as `desc` above, and this one matters more:
  // og:title is the line a link preview shows first. `title` may have come
  // straight out of <title>…</title> already escaped, so escaping it again
  // rendered "Bloom & Co" as "Bloom &amp; Co" in every share card. The earlier
  // fix covered `desc` and missed this — caught by tests/site-seo.test.mjs.
  upsert(
    /<meta\s+property=["']og:title["'][^>]*>/i,
    "content",
    title,
    `<meta property="og:title" content="${escapeHtml(decodeHtml(title))}" />`,
  );
  upsert(
    /<meta\s+property=["']og:description["'][^>]*>/i,
    "content",
    desc,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
  );
  upsert(
    /<meta\s+property=["']og:type["'][^>]*>/i,
    "content",
    "website",
    `<meta property="og:type" content="website" />`,
  );
  upsert(
    /<meta\s+property=["']og:url["'][^>]*>/i,
    "content",
    selfUrl,
    `<meta property="og:url" content="${escapeHtml(selfUrl)}" />`,
  );
  upsert(
    /<meta\s+name=["']twitter:card["'][^>]*>/i,
    "content",
    "summary_large_image",
    `<meta name="twitter:card" content="summary_large_image" />`,
  );

  if (inject.length) {
    out = out.replace(/<\/head>/i, `  ${inject.join("\n    ")}\n  </head>`);
  }

  // Crawlers reject relative og:image, so absolutise whatever the builder set.
  out = out.replace(
    /(<meta\s+property=["']og:image["']\s+content=["'])([^"']+)(["'])/gi,
    (_m, pre, url, post) => `${pre}${escapeHtml(absolutise(url, baseUrl))}${post}`,
  );

  return out;
}

/** robots.txt pointing crawlers at the sitemap. Generated, never stored. */
export function robotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl.replace(/\/$/, "")}/sitemap.xml\n`;
}

/**
 * sitemap.xml from the site's published HTML files — ONE ENTRY PER PAGE.
 * Generated per request so it can use the visitor-facing host and can never
 * drift from what is served.
 *
 * Every loc goes through pageUrl(), which is also what stamps each page's
 * canonical tag, so the sitemap and the pages it lists cannot disagree. It is
 * also what makes the dedupe real rather than cosmetic: about.html and
 * /about.html were already collapsed, but so are about.html and about/index.html
 * — two files that would otherwise have listed the same page twice.
 */
export function sitemapXml(baseUrl: string, htmlPaths: string[], lastMod?: Date): string {
  const seen = new Set<string>();
  const urls = htmlPaths
    .map((p) => pageUrl(baseUrl, p))
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .map((u) => {
      const loc = escapeXml(u);
      const mod = lastMod ? `\n    <lastmod>${lastMod.toISOString().slice(0, 10)}</lastmod>` : "";
      return `  <url>\n    <loc>${loc}</loc>${mod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

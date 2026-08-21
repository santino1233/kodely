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
 * Two shapes, because middleware rewrites the branded subdomain onto an
 * internal path:
 *   <slug>.kodely.site/         -> internally /api/site/<slug>
 *   staging.kodely.me/api/site/<slug>/   (no wildcard DNS off prod)
 *
 * Canonical/OG URLs must use the EXTERNAL form or they point somewhere the
 * visitor's browser never went, so this keys off the Host header.
 */
export function siteBaseUrl(req: Request, slug: string): string {
  const host = req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const bare = host.split(":")[0];
  // Branded subdomain: the site lives at the host root.
  if (bare.endsWith(`.${SITES_BASE}`)) return `${proto}://${host}`;
  // Otherwise it is served under a path (staging, localhost).
  return `${proto}://${host}/api/site/${slug}`;
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
export function applySeo(html: string, opts: { projectName: string; baseUrl: string }): string {
  const { projectName, baseUrl } = opts;
  if (!/<head[\s>]/i.test(html)) return html; // not a full document; leave alone

  let out = html;

  // 1. Title — replace the placeholder, or add one if missing entirely.
  const titleMatch = out.match(/<title>([\s\S]*?)<\/title>/i);
  const currentTitle = titleMatch?.[1]?.trim();
  const title = !currentTitle || currentTitle === PLACEHOLDER_TITLE ? projectName : currentTitle;
  if (titleMatch) {
    if (currentTitle !== title) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    }
  } else {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n    <title>${escapeHtml(title)}</title>`);
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
      out = out.replace(existing[0], tag);
    }
  };

  const desc = `${title} — built with Kodely.`;
  upsert(
    /<meta\s+name=["']description["'][^>]*>/i,
    "content",
    desc,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
  );
  upsert(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    "href",
    baseUrl,
    `<link rel="canonical" href="${escapeHtml(baseUrl)}" />`,
  );
  upsert(
    /<meta\s+property=["']og:title["'][^>]*>/i,
    "content",
    title,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
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
    baseUrl,
    `<meta property="og:url" content="${escapeHtml(baseUrl)}" />`,
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
 * sitemap.xml from the site's published HTML files. Generated per request so
 * it can use the visitor-facing host and can never drift from what is served.
 */
export function sitemapXml(baseUrl: string, htmlPaths: string[], lastMod?: Date): string {
  const base = baseUrl.replace(/\/$/, "");
  const seen = new Set<string>();
  const urls = htmlPaths
    .map((p) => (p === "index.html" ? "" : `/${p.replace(/^\//, "")}`))
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .map((u) => {
      const loc = escapeXml(base + u);
      const mod = lastMod ? `\n    <lastmod>${lastMod.toISOString().slice(0, 10)}</lastmod>` : "";
      return `  <url>\n    <loc>${loc}</loc>${mod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

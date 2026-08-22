// WHICH HOSTS MAY SERVE A CUSTOMER'S GENERATED HTML.
//
// The site route renders arbitrary attacker-authored markup with
// `Content-Type: text/html` and a CSP whose `'self'` resolves to whatever host
// the request arrived on. On <slug>.kodely.site that is exactly right: the page
// is first-party to its own site and to nothing else. On kodely.me it is a
// first-party page on the application's own origin, with a real certificate and
// the real domain in the address bar — a phishing surface. Nothing in the route
// or the proxy used to look at the Host header at all, so
// https://kodely.me/api/site/<any-published-slug>/ served that page to anyone.
//
// This is an ALLOWLIST, not a block on the app domain. A blocklist would have
// to enumerate every name the app answers to (apex, www, the admin host, any
// future one) and would fail open the moment one was added.
//
// The `/api/site/<slug>` path form is NOT the bug and is not removed: staging
// depends on it, because there is no wildcard DNS for *.kodely.site off prod, so
// staging.kodely.me/api/site/<slug> is the only way to look at a published site
// there. lib/site-seo.ts derives canonical and og:url from precisely this
// subdomain-vs-path distinction, and both forms below keep producing the URL
// they produced before.

const SITES_BASE = (process.env.KODELY_SITES_BASE ?? "kodely.site").trim().toLowerCase();

// Where the path form stays legitimate. Overridable so a second staging
// environment does not need a code change; the default is what deploy.sh
// deploys and verifies.
const STAGING_HOST = (process.env.KODELY_STAGING_HOST ?? "staging.kodely.me").trim().toLowerCase();

/** Host header minus the port, lowercased. Handles bracketed IPv6 literals. */
export function bareHost(host: string): string {
  const h = host.trim().toLowerCase();
  const v6 = h.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1];
  return h.split(":")[0];
}

function isLoopback(bare: string): boolean {
  return (
    bare === "localhost" ||
    bare.endsWith(".localhost") ||
    bare === "127.0.0.1" ||
    bare === "::1"
  );
}

/**
 * May this Host serve the published site `slug`?
 *
 * Three shapes, and nothing else:
 *
 *  1. `<slug>.kodely.site` — the branded subdomain, which proxy.ts rewrites to
 *     this route. Note it must match THIS slug: `a.kodely.site/api/site/b/` is
 *     refused. That is not the reported finding, but it is the same mistake one
 *     level down — it would let any customer host any other customer's page on
 *     their own site's origin, where `'self'` and `frame-ancestors 'self'` both
 *     resolve to the victim site's name. The legitimate rewrite always agrees
 *     with the subdomain, so nothing real is affected.
 *  2. The staging host, on the path form, because staging has no wildcard DNS.
 *     Staging is not the application's public identity; a page served there is
 *     not a credible impersonation of kodely.me, and reaching it means the
 *     victim already accepted a staging URL.
 *  3. Loopback, so local development and `next start` testing keep working.
 *
 * Everything else — kodely.me, www, the admin host, any bare IP, any Host a
 * caller invents — is refused.
 */
export function siteHostAllowed(host: string, slug: string): boolean {
  const bare = bareHost(host);
  if (!bare) return false;

  const wanted = slug.trim().toLowerCase();
  if (wanted && bare === `${wanted}.${SITES_BASE}`) return true;
  if (bare === STAGING_HOST) return true;
  return isLoopback(bare);
}

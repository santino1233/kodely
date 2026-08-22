// The public address of a published site, derived exactly the way
// app/api/projects/[id]/publish/route.ts:180-183 derives the URL it hands the
// customer at the moment they publish.
//
// Two shapes, and the choice is made by the request's own Host header rather
// than by an env var:
//   prod     -> https://<slug>.kodely.site      (the *.kodely.site wildcard)
//   staging  -> https://<host>/api/site/<slug>  (no wildcard DNS off prod)
//
// If this page invented its own rule the address shown here could disagree
// with the one the publish call returned, which is the one thing a page about
// addresses must never do.

const SITES_BASE = (process.env.KODELY_SITES_BASE ?? "kodely.site").trim().toLowerCase();

/** Full URL, protocol included. Safe to put in an href or on the clipboard. */
export function siteAddress(host: string, slug: string): string {
  return host.includes("staging")
    ? `https://${host}/api/site/${slug}`
    : `https://${slug}.${SITES_BASE}`;
}

/** The same address without the scheme — what a person reads and repeats. */
export function siteAddressLabel(host: string, slug: string): string {
  return siteAddress(host, slug).replace(/^https:\/\//, "");
}

/** The pattern itself, for explaining the scheme rather than one instance. */
export const ADDRESS_PATTERN = `your-site-name.${SITES_BASE}`;

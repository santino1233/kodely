// Head-rewriting for the SEO panel, kept out of route.ts so it can be tested
// without standing up a request and a session. Next is particular about what a
// route module exports, which is the other reason this is its own file.

export type SeoValues = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
};

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace a tag's value, or inject the tag when it is absent.
 *
 * Every replacement goes through a FUNCTION, never a string. In a string
 * replacement `$` is a substitution sigil: `$&`, `` $` ``, `$'` and `$1` are
 * all expanded, and escapeAttr does not escape `$`. A site called
 * "Everything $1 Store" silently lost the `$1`, and a value containing
 * `` $` `` spliced the ENTIRE PRECEDING DOCUMENT into a meta attribute.
 * A replacer function receives the match and returns a literal.
 */
function upsertMeta(html: string, matcher: RegExp, tag: string): string {
  const existing = html.match(matcher);
  if (existing) return html.replace(existing[0], () => tag);
  return html.replace(/<head([^>]*)>/i, (_m, attrs: string) => `<head${attrs}>\n    ${tag}`);
}

/**
 * Write the four editable values into a document's head.
 *
 * Returns the input unchanged when there is no <head> — injecting one into a
 * fragment would produce something worse than what we were given.
 */
export function applyHead(html: string, v: SeoValues): string {
  if (!/<head[\s>]/i.test(html)) return html;

  let out = html;

  const title = `<title>${escapeAttr(v.title)}</title>`;
  out = /<title>[\s\S]*?<\/title>/i.test(out)
    ? out.replace(/<title>[\s\S]*?<\/title>/i, () => title)
    : out.replace(/<head([^>]*)>/i, (_m, attrs: string) => `<head${attrs}>\n    ${title}`);

  out = upsertMeta(
    out,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeAttr(v.description)}" />`,
  );
  out = upsertMeta(
    out,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapeAttr(v.ogTitle)}" />`,
  );
  out = upsertMeta(
    out,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapeAttr(v.ogDescription)}" />`,
  );

  return out;
}

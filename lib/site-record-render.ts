import { db } from "@/lib/db";
import { PATH_IDENTIFIER_RE, escapeHtml } from "@/lib/site-endpoint";

// =============================================================================
// LIVE READ-BACK FOR PUBLISHED GENERATED SITES ("Phase 1B")
// =============================================================================
//
// The read half of the SiteRecord round trip (lib/site-records.ts is the write
// half). A page can show what has already been submitted — a class roster, a
// list of open listings, testimonials — with ZERO client JavaScript and ZERO
// CSP change, by authoring a small, fixed markup convention that this module
// resolves server-side, once per request, in the same route
// (app/api/site/[slug]/[[...path]]/route.ts) that already reads the file out
// of `db.projectFile`.
//
// THE CONTRACT (also documented for the builder model in lib/agent.ts)
// ----------------------------------------------------------------------------
//   <div data-kodely-records="<kind>">
//     <p>Nothing yet.</p>                      <-- empty-state, authored by
//                                                   the builder, kept as-is
//                                                   when there are 0 records
//     <template data-kodely-record-template>
//       <p>{{name}} — {{time}}</p>              <-- cloned once per record
//     </template>
//   </div>
//
// `{{fieldName}}` is substituted ONLY when it appears in TEXT — never inside
// a tag's attributes. That is not a limitation to lift later; it is the whole
// reason this is safe without a real DOM: a value is only ever spliced into a
// position that cannot become a new attribute, a new tag, or an event
// handler, however it is escaped. See renderTemplate() below for exactly how
// text is told apart from markup.
//
// `data-kodely-mine` (Phase 2, alongside lib/site-auth.ts's magic-link
// accounts) is an additional boolean attribute on the SAME container:
//   <div data-kodely-records="booking" data-kodely-mine>
// meaning "only the records created by the CURRENTLY authenticated visitor",
// instead of every active record of that kind. See renderSiteRecords()'s
// `visitorId` parameter for exactly how that is resolved and filtered.
//
// WHY NOT A REAL DOM PARSER
// ----------------------------------------------------------------------------
// No new dependency is allowed, and none of jsdom/cheerio/parse5 is already a
// project dependency (lib/site-seo.ts's applySeo() sets the precedent: it
// rewrites <head> tags with plain regexes on this exact serving path). The
// markup this module has to understand is narrow and self-imposed — one
// attribute name, one child element — so a small hand-written scanner that
// tracks tag nesting depth is enough, and is what is built below.
//
// WHAT IS UNTRUSTED HERE
// ----------------------------------------------------------------------------
// Only the RECORD VALUES coming out of the database — the container and
// template markup themselves are the builder's own static HTML, already
// served as-is everywhere else on the site. Every record value is escaped
// exactly the way lib/site-endpoint.ts's escapeHtml() escapes a value before
// it reaches any other HTML context in this codebase; there is no second
// escaping routine to keep in sync.

const CONTAINER_ATTR = "data-kodely-records";
const TEMPLATE_ATTR = "data-kodely-record-template";
/** Boolean attribute — presence alone means "only render records created by
 *  the CURRENTLY authenticated visitor" instead of every active record of
 *  that kind. See renderSiteRecords()'s `visitorId` parameter below. */
const MINE_ATTR = "data-kodely-mine";

/** Same discipline as a record `kind` at write time (lib/site-records.ts's
 *  RECORD_KIND_RE) — a container whose attribute value doesn't match this is
 *  not a kind any record could ever have been written under, so it is left
 *  alone rather than queried. */
const KIND_RE = PATH_IDENTIFIER_RE;

/** A field name inside `{{...}}`. Matches lib/site-endpoint.ts's FIELD_NAME_RE
 *  character class (not the import itself, since that one is anchored for
 *  whole-string validation and this needs to match inside a larger string). */
const PLACEHOLDER_RE = /\{\{([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g;

/** Records rendered into any one container. Keeps a page from ever growing
 *  unboundedly with the site's history — a hard ceiling, not a page size a
 *  builder can raise from markup. */
const MAX_RECORDS_PER_CONTAINER = 100;

/** HTML tags with no closing tag at all — never contribute to nesting depth,
 *  and can appear freely inside a container's or template's markup. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Elements whose content is not markup to recurse into — skipped to their
 *  own literal closing tag so a `<script>` containing the text "</div>" (or
 *  anything else tag-shaped) can never desynchronise the depth count. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

type OpenTag = { end: number; tagName: string; attrs: string; selfClosing: boolean };

/**
 * Read one open (or self-closing) tag starting at `html[start] === "<"`,
 * respecting quoted attribute values so a `>` inside `alt="a > b"` cannot be
 * mistaken for the tag's own end. Returns null for anything that isn't
 * actually a tag start (e.g. a bare `<` in text, which real builder markup
 * would have written as `&lt;` but this stays defensive regardless).
 */
function readOpenTag(html: string, start: number): OpenTag | null {
  const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start));
  if (!nameMatch) return null;
  const tagName = nameMatch[1].toLowerCase();
  let i = start + nameMatch[0].length;
  let quote: string | null = null;
  while (i < html.length) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === ">") {
      const selfClosing = html[i - 1] === "/";
      return { end: i + 1, tagName, attrs: html.slice(start, i + 1), selfClosing };
    }
    i++;
  }
  return null; // unterminated tag — leave the rest of the document alone
}

/**
 * From `from` (just past a tagName's opening `>`), find where ITS matching
 * closing tag ends — tracking nested same-name tags, skipping comments and
 * raw-text elements, and never counting a void element as needing a close.
 * Returns null if the document runs out before the tag is closed (malformed
 * or truncated markup — the caller treats that container/template as absent
 * rather than guessing).
 */
function findMatchingClose(
  html: string,
  tagName: string,
  from: number,
): { closeStart: number; end: number } | null {
  let depth = 1;
  let i = from;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) return null;

    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }

    if (html[lt + 1] === "/") {
      const m = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/.exec(html.slice(lt));
      if (!m) {
        i = lt + 2;
        continue;
      }
      const name = m[1].toLowerCase();
      const tagEnd = lt + m[0].length;
      if (name === tagName) {
        depth--;
        if (depth === 0) return { closeStart: lt, end: tagEnd };
      }
      i = tagEnd;
      continue;
    }

    const tag = readOpenTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    if (RAW_TEXT_ELEMENTS.has(tag.tagName) && !tag.selfClosing) {
      const closeRe = new RegExp(`</${tag.tagName}\\s*>`, "i");
      const m = closeRe.exec(html.slice(tag.end));
      i = m ? tag.end + m.index + m[0].length : html.length;
      continue;
    }
    if (tag.tagName === tagName && !tag.selfClosing && !VOID_ELEMENTS.has(tagName)) {
      depth++;
    }
    i = tag.end;
  }
  return null;
}

type Container = {
  tagName: string;
  kind: string;
  /** Whether this container carried `data-kodely-mine`. */
  mine: boolean;
  innerStart: number;
  innerEnd: number;
  outerEnd: number;
};

/**
 * Every TOP-LEVEL `data-kodely-records="<kind>"` container in the document.
 * "Top-level" is deliberate: once a container is found, the scan resumes
 * AFTER its matching close tag rather than inside it, so nested containers
 * are never matched. That keeps every found range disjoint, which is what
 * lets renderSiteRecords() below splice them all back in a single backward
 * pass without one replacement invalidating another's offsets.
 */
function findContainers(html: string): Container[] {
  const containers: Container[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }
    if (html[lt + 1] === "/") {
      i = lt + 2;
      continue;
    }

    const tag = readOpenTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }

    const attrMatch =
      new RegExp(`${CONTAINER_ATTR}\\s*=\\s*"([^"]*)"`).exec(tag.attrs) ??
      new RegExp(`${CONTAINER_ATTR}\\s*=\\s*'([^']*)'`).exec(tag.attrs);

    if (attrMatch && KIND_RE.test(attrMatch[1]) && !tag.selfClosing && !VOID_ELEMENTS.has(tag.tagName)) {
      const close = findMatchingClose(html, tag.tagName, tag.end);
      if (close) {
        containers.push({
          tagName: tag.tagName,
          kind: attrMatch[1],
          mine: new RegExp(`\\b${MINE_ATTR}\\b`).test(tag.attrs),
          innerStart: tag.end,
          innerEnd: close.closeStart,
          outerEnd: close.end,
        });
        i = close.end; // skip the whole container: enforces non-overlap
        continue;
      }
    }

    i = tag.end;
  }
  return containers;
}

/** Find the immediate `<template data-kodely-record-template>` inside
 *  `html[from, to)` and return its own span plus its inner markup. Only the
 *  FIRST such template counts, per the contract's "exactly one" — a second
 *  one, if a builder ever wrote one, is simply left as static content
 *  (harmless: it renders as an inert, non-visible `<template>` in a browser
 *  either way, exactly as authored). */
function findTemplate(html: string, from: number, to: number): { start: number; end: number; inner: string } | null {
  let i = from;
  while (i < to) {
    const lt = html.indexOf("<", i);
    if (lt === -1 || lt >= to) return null;

    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close === -1 ? to : close + 3;
      continue;
    }
    if (html[lt + 1] === "/") {
      i = lt + 2;
      continue;
    }

    const tag = readOpenTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }

    if (tag.tagName === "template" && new RegExp(`\\b${TEMPLATE_ATTR}\\b`).test(tag.attrs)) {
      if (tag.selfClosing) return { start: lt, end: tag.end, inner: "" };
      const close = findMatchingClose(html, "template", tag.end);
      if (close && close.end <= to) {
        return { start: lt, end: close.end, inner: html.slice(tag.end, close.closeStart) };
      }
      return null;
    }

    i = tag.end;
  }
  return null;
}

/**
 * Clone one template's inner markup for one record, substituting `{{field}}`
 * ONLY in text — never inside a tag. Splitting on `<[^>]*>` alternates
 * text/tag segments (`String#split` with a capturing group interleaves the
 * matched delimiters into the result), and only the even-indexed, non-tag
 * segments are ever run through the placeholder regex — a tag segment is
 * copied through completely untouched, `{{...}}` and all, which is what
 * makes attribute-position interpolation impossible rather than merely
 * undocumented.
 *
 * A field the record does not have renders as empty text, not as the literal
 * placeholder and not as an error — a record may not carry every field a
 * template expects (blank fields are dropped entirely at write time).
 * `escapeHtml` is the same function every other HTML boundary in this
 * codebase uses, so this shares its guarantees rather than re-deriving them.
 */
function renderTemplate(templateInner: string, fields: Record<string, string>): string {
  const segments = templateInner.split(/(<[^>]*>)/);
  return segments
    .map((segment, i) => {
      if (i % 2 === 1) return segment; // a tag itself — never touched
      return segment.replace(PLACEHOLDER_RE, (_m, name: string) => {
        const value = fields[name];
        return value === undefined ? "" : escapeHtml(value);
      });
    })
    .join("");
}

/** `SiteRecord.fields` is Json; narrow it to the string map every write path
 *  actually produces. Defensive rather than trusting the column shape, same
 *  as the owner dashboard (app/projects/[id]/records/page.tsx) already is. */
function fieldsOf(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * Resolve every `data-kodely-records="<kind>"` container in `html` against
 * the PUBLISHED, non-spam SiteRecord rows for `projectId`, and return the
 * document with each one filled in.
 *
 * `visitorId` is the CURRENTLY authenticated site visitor for this request,
 * or null — resolved once per request by the caller via
 * resolveSiteVisitor() (lib/site-auth.ts) and threaded through here rather
 * than re-resolved per container. A container also carrying
 * `data-kodely-mine` is filtered to only that visitor's own records; with no
 * visitor signed in, it is treated as having zero matching records (no query
 * is even run) — which lands on the builder's OWN empty-state markup, same
 * as the "nothing submitted yet" case, so the fallback is real copy the
 * builder wrote (see lib/agent.ts's guidance to write a "sign in to see
 * this" empty state for a `data-kodely-mine` container) rather than a blank
 * gap with no explanation.
 *
 * Batches ONE query per distinct (kind, mine) pair found on the page, not one
 * per container — two containers wanting the same data still cost one query,
 * and a page with none of this markup costs zero queries and returns `html`
 * untouched, checked via a cheap substring test before any parsing happens.
 */
export async function renderSiteRecords(
  html: string,
  projectId: string,
  visitorId: string | null = null,
): Promise<string> {
  if (!html.includes(CONTAINER_ATTR)) return html;

  const containers = findContainers(html);
  if (containers.length === 0) return html;

  const groupKey = (c: Container) => `${c.kind} ${c.mine ? "1" : "0"}`;
  const groups = [...new Set(containers.map(groupKey))];
  const rowsByGroup = new Map<string, Record<string, string>[]>();
  await Promise.all(
    groups.map(async (key) => {
      const [kind, mineFlag] = key.split(" ");
      const mine = mineFlag === "1";
      // No visitor signed in and this container wants "mine": nothing to
      // show, and nothing worth a query — see the header comment above.
      if (mine && !visitorId) {
        rowsByGroup.set(key, []);
        return;
      }
      const rows = await db.siteRecord.findMany({
        where: { projectId, kind, status: "active", spam: false, ...(mine ? { siteVisitorId: visitorId } : {}) },
        orderBy: { createdAt: "desc" },
        take: MAX_RECORDS_PER_CONTAINER,
        select: { fields: true },
      });
      rowsByGroup.set(key, rows.map((r) => fieldsOf(r.fields)));
    }),
  );

  // Spliced from the LAST container to the first: containers are disjoint
  // (findContainers never returns overlapping ranges), so replacing one never
  // shifts the offsets of an earlier one still to be processed.
  let out = html;
  for (let idx = containers.length - 1; idx >= 0; idx--) {
    const c = containers[idx];
    const templ = findTemplate(html, c.innerStart, c.innerEnd);
    if (!templ) continue; // no template child: nothing this module can render

    const before = html.slice(c.innerStart, templ.start);
    const after = html.slice(templ.end, c.innerEnd);
    const records = rowsByGroup.get(groupKey(c)) ?? [];

    // The <template> tag is removed from served output either way — it is a
    // build-time-authored template, never something a browser should be
    // asked to render. Zero matching records keeps the builder's own
    // empty-state (`before` + `after`, i.e. everything except the template);
    // one or more replaces the container's content with the rendered clones.
    const newInner =
      records.length === 0 ? before + after : records.map((r) => renderTemplate(templ.inner, r)).join("");

    out = out.slice(0, c.innerStart) + newInner + out.slice(c.innerEnd);
  }
  return out;
}

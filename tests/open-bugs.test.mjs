// FAILING ON PURPOSE. Every test in this file asserts the behaviour the code
// SAYS it has, in its own comments, and every one of them fails today.
//
// They are not skipped, and they are not marked todo, because a suite that
// quietly tolerates a known-wrong answer is how the answer stays wrong. Each
// test names the file and line, and each will go green the moment the bug is
// fixed — nothing in here needs rewriting at that point.
//
// The task that produced this suite forbade touching application code, so the
// fixes are described in comments rather than applied. See scripts/test/README.md.

import test from "node:test";
import assert from "node:assert/strict";

import { applySeo } from "../lib/site-seo.ts";
import { applyHead } from "../app/api/projects/[id]/seo/head.ts";
import { isFlagKey } from "../lib/flags.ts";
import { isWindowKey } from "../app/admin/health/data.ts";
import { findAssets } from "../lib/assets/index.ts";
import { classifyFollowUp } from "../lib/feedback-intent.ts";

const doc = (head) => `<!doctype html><html lang="en"><head>${head}</head><body><p>hi</p></body></html>`;

function attr(html, re, name) {
  const tag = html.match(re);
  if (!tag) return null;
  return tag[0].match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// BUG 1 — lib/site-seo.ts:155-160. og:title still double-escapes.
//
// The entity round trip was fixed for `description` (line 142 calls
// decodeHtml before composing) but the og:title upsert passes the raw `title`
// straight to escapeHtml. When the title came out of <title>…</title> it is
// already encoded, so "Bloom & Co" reaches link previews as "Bloom &amp; Co" —
// the exact symptom the decodeHtml comment says was fixed, on the exact tag
// that link previews read first.
//
// Fix: escapeHtml(decodeHtml(title)) at line 159, matching what `desc` does.
// ───────────────────────────────────────────────────────────────────────────

test("BUG: applySeo double-escapes an already-encoded title into og:title", () => {
  const out = applySeo(doc("<title>Bloom &amp; Co</title>"), {
    projectName: "Ignored",
    baseUrl: "https://bloom.kodely.site",
  });
  const ogTitle = attr(out, /<meta\s+property=["']og:title["'][^>]*>/i, "content");
  const description = attr(out, /<meta\s+name=["']description["'][^>]*>/i, "content");

  // The description gets this right — it decodes first.
  assert.equal(description, "Bloom &amp; Co — built with Kodely.");
  // og:title does not.
  assert.equal(ogTitle, "Bloom &amp; Co", "og:title double-escaped the ampersand");
});

// ───────────────────────────────────────────────────────────────────────────
// BUG 2 — $-substitution in String.prototype.replace replacements.
//
//   lib/site-seo.ts:114, 117, 135
//   app/api/projects/[id]/seo/head.ts:23, 40, 41
//
// Every one of these builds the replacement as a STRING, so `$&`, "$`", "$'"
// and (for the regex forms) `$1` are interpreted as substitution patterns
// rather than literal text. escapeHtml/escapeAttr do not escape `$`, and `$`
// is entirely ordinary in a business name — "Everything $1 Store", "Cash $ave".
//
// The damage is not cosmetic: `$&` splices the matched tag, and "$`" splices
// the ENTIRE PRECEDING DOCUMENT, into a meta attribute. applySeo runs on every
// read of every published site, so this ships to visitors.
//
// Fix: pass a replacer function — .replace(pattern, () => tag) — everywhere a
// user-controlled string is interpolated into a replacement.
// ───────────────────────────────────────────────────────────────────────────

test("BUG: applySeo treats $1 in a project name as a capture-group reference", () => {
  // The <head> injection path is `out.replace(/<head([^>]*)>/i, `<head$1>…`)`,
  // so a `$1` inside the title is expanded to the head's attributes.
  const out = applySeo(doc('<meta charset="utf-8" />'), {
    projectName: "Everything $1 Store",
    baseUrl: "https://e.kodely.site",
  });
  assert.equal(out.match(/<title>([\s\S]*?)<\/title>/i)?.[1], "Everything $1 Store");
});

test("BUG: applySeo splices the document into a meta tag when the title contains $&", () => {
  const out = applySeo(doc("<title>Kodely Site</title>"), {
    projectName: "Rock $& Roll",
    baseUrl: "https://r.kodely.site",
  });
  assert.equal(out.match(/<title>([\s\S]*?)<\/title>/i)?.[1], "Rock $&amp; Roll");
  assert.ok(!out.includes("<title>Kodely Site</title>"), "the replaced tag was spliced back in");
});

test("BUG: applyHead splices the matched tag when a value contains $&", () => {
  const out = applyHead(doc(`<title>Old</title><meta name="description" content="x" />`), {
    title: "T",
    description: "Save $& today",
    ogTitle: "OT",
    ogDescription: "OD",
  });
  assert.equal(
    attr(out, /<meta\s+name=["']description["'][^>]*>/i, "content"),
    "Save $&amp; today",
  );
  assert.equal((out.match(/name="description"/g) ?? []).length, 1, "a whole tag was spliced into an attribute");
});

test("BUG: applyHead is not idempotent once a value contains a $ pattern", () => {
  const values = { title: "Deal $& Save", description: "d", ogTitle: "o", ogDescription: "od" };
  const once = applyHead(doc("<title>Old</title>"), values);
  assert.equal(applyHead(once, values), once);
});

// ───────────────────────────────────────────────────────────────────────────
// BUG 3 — `v in OBJ` membership guards still walk the prototype chain.
//
//   lib/flags.ts:167                 isFlagKey
//   app/admin/health/data.ts:22      isWindowKey
//   app/admin/users/page.tsx:37      isSortKey     (not exported — see README)
//   app/admin/content/page.tsx:53    isSortKey     (not exported — see README)
//
// app/admin/sites was fixed by switching to `hasKey` (app/admin/sites/ui.tsx:25,
// with the note at app/admin/sites/page.tsx:52 spelling out the exact failure).
// Four more guards of the same shape were left behind.
//
// The consequence is reachable from a URL by anyone who can load the page:
// `?sort=constructor` passes the guard, `SORTS.constructor.orderBy` is
// undefined, and Prisma throws — a 500 rather than a fallback to the default
// sort. `?window=constructor` on /admin/health does the same. In lib/flags.ts
// it is worse than a 500: setFlag's `if (!isFlagKey(key)) throw` is the ONLY
// thing stopping a Server Action from writing junk keys into FeatureFlag, and
// FLAG_SPECS.constructor is a function, so `spec.whenUnset` is undefined and a
// row is written with an undefined default.
//
// Fix: Object.hasOwn(OBJ, v) — or reuse hasKey from app/admin/sites/ui.tsx.
// ───────────────────────────────────────────────────────────────────────────

const PROTOTYPE_KEYS = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"];

test("BUG: isFlagKey accepts Object.prototype members as valid flag keys", () => {
  assert.equal(isFlagKey("generation.enabled"), true, "a real key must still pass");
  assert.equal(isFlagKey("nope"), false);
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(isFlagKey(key), false, `isFlagKey(${JSON.stringify(key)}) let a prototype member through`);
  }
});

test("BUG: isWindowKey accepts Object.prototype members — /admin/health?window=constructor 500s", () => {
  assert.equal(isWindowKey("24h"), true, "a real key must still pass");
  assert.equal(isWindowKey("nope"), false);
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(isWindowKey(key), false, `isWindowKey(${JSON.stringify(key)}) let a prototype member through`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// BUG 4 — lib/assets/index.ts:126 (DEMONYMS) and :543 (the tie-break).
//
// The DEMONYMS comment claims the demonym fix covers "american" (American
// Samoa) alongside "french" and "british". It does not. France and the UK only
// come out on top because the score tie is broken by `a.entry.id.localeCompare`
// and "flag:fr" < "flag:gf", "flag:gb" < "flag:io". For the US the alphabet
// runs the other way — "flag:as" < "flag:us" — so "american flag" returns
// AMERICAN SAMOA first. The fix that was applied is load-bearing on luck.
//
// Fix: break the tie on something meaningful before falling back to the id —
// e.g. score a demonym listed in DEMONYMS above a name-derived token, or
// prefer a sovereign entry over a territory.
// ───────────────────────────────────────────────────────────────────────────

test('BUG: "american flag" returns American Samoa, not the United States', () => {
  assert.equal(findAssets("american flag", { limit: 1 })[0].id, "flag:us");
});

// ───────────────────────────────────────────────────────────────────────────
// BUG 5 — lib/assets/index.ts:505-512. The docstring's own example returns [].
//
// "Multi-word queries are AND-ish: every token must contribute something, so
// 'coffee shop' prefers assets that speak to both rather than everything that
// mentions 'shop'." In practice `shop` expands only to store/shopping/cart/bag
// and the coffee icon carries none of those, so EVERY entry misses a token and
// the query returns nothing at all — the single most likely thing a cafe-site
// build would ask for.
//
// Fix: either let a multi-token query fall back to the best partial match when
// the AND yields nothing, or add the missing synonym edges.
// ───────────────────────────────────────────────────────────────────────────

test('BUG: findAssets("coffee shop") — the docstring\'s own example — returns nothing', () => {
  const results = findAssets("coffee shop", { limit: 5 });
  assert.ok(results.length > 0, "a two-word query for an obvious asset returned an empty list");
});

// ───────────────────────────────────────────────────────────────────────────
// BUG 6 — lib/feedback-intent.ts:56-69. Rule order mis-buckets the module's
// own headline example.
//
// The file header opens with: 'If "the copy is generic" is 40% of follow-ups
// and "it's broken" is 2%, that ranks the next prompt change for us.' That
// phrase classifies as `visual`, not `content`: "generic" sits in the visual
// pattern (as a design adjective) and visual is tested before content, so the
// word "copy" never gets a look in. The dashboard the module exists to feed
// therefore files copy complaints under styling.
//
// Fix: the same class of problem as the colou?r plural — an over-broad token
// in a higher-priority rule. Either drop the bare "generic"/"bland" adjectives
// from `visual` or test for an explicit content noun first.
// ───────────────────────────────────────────────────────────────────────────

test('BUG: "the copy is generic" buckets as visual, not content', () => {
  assert.equal(classifyFollowUp("the copy is generic"), "content");
});

test('BUG: "the wording is generic" and "the text is bland" are content too', () => {
  assert.equal(classifyFollowUp("the wording is generic"), "content");
  assert.equal(classifyFollowUp("the text is bland"), "content");
});

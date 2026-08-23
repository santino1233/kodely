// lib/assets/index.ts — the asset library's query function.
//
// findAssets is shaped like a tool call, so these tests treat it like one: the
// question is always "would a model asking this question get the right thing
// back", not "does the scorer return the number it returns today".

import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_KINDS,
  assetCatalogSummary,
  findAssets,
  getAsset,
  listAssetIds,
  listAssets,
} from "../lib/assets/index.ts";

const ids = (matches) => matches.map((m) => m.id);

// ── The demonym regression ─────────────────────────────────────────────────

test('"french flag" returns France, not French Guiana', () => {
  // THE REGRESSION. Flag keywords are derived from the country NAME, so
  // "French Guiana" owned the literal token "french" and scored a full keyword
  // hit while France could only be reached through a discounted synonym. The
  // search returned three obscure territories and not the country anyone meant.
  assert.equal(findAssets("french flag", { limit: 1 })[0].id, "flag:fr");
});

test('"british flag" returns the United Kingdom, not a territory', () => {
  assert.equal(findAssets("british flag", { limit: 1 })[0].id, "flag:gb");
});

test("a sovereign country outscores or ties every territory named after it", () => {
  // The fix is entry-side: listing the demonym as a keyword on the country
  // lets it match the same token at the same strength as the territory.
  for (const [query, sovereign] of [
    ["french flag", "flag:fr"],
    ["british flag", "flag:gb"],
    ["american flag", "flag:us"],
  ]) {
    const top = findAssets(query, { kind: "flag", limit: 5 });
    const own = top.find((m) => m.id === sovereign);
    assert.ok(own, `${query} did not return ${sovereign} at all`);
    assert.equal(own.score, Math.max(...top.map((m) => m.score)), `${query}: ${sovereign} was outscored`);
  }
});

test("a territory search still finds the territory", () => {
  // The second token is the one only the territory carries.
  assert.equal(findAssets("french guiana", { limit: 1 })[0].id, "flag:gf");
});

test("other demonyms resolve to their country", () => {
  for (const [query, expected] of [
    ["german flag", "flag:de"],
    ["spanish flag", "flag:es"],
    ["irish flag", "flag:ie"],
    ["canadian flag", "flag:ca"],
    ["japanese flag", "flag:jp"],
    ["italian flag", "flag:it"],
  ]) {
    assert.equal(findAssets(query, { limit: 1 })[0].id, expected, query);
  }
});

test("a country name and its ISO code both find it", () => {
  assert.equal(findAssets("france", { kind: "flag", limit: 1 })[0].id, "flag:fr");
  assert.equal(findAssets("united states", { kind: "flag", limit: 1 })[0].id, "flag:us");
  assert.equal(findAssets("usa", { kind: "flag", limit: 1 })[0].id, "flag:us");
});

// ── Scoring shape ──────────────────────────────────────────────────────────

test("an exact id beats a keyword match", () => {
  const results = findAssets("wrench", { kind: "icon", limit: 5 });
  assert.equal(results[0].id, "icon:wrench");
  assert.ok(results[0].score > (results[1]?.score ?? 0));
});

test("a synonym hit never outranks the word the caller actually typed", () => {
  // "plumber" reaches the wrench only through SYNONYMS, so its score must be
  // strictly below what typing "wrench" scores.
  const literal = findAssets("wrench", { kind: "icon", limit: 1 })[0];
  const viaSynonym = findAssets("plumber", { kind: "icon", limit: 1 })[0];
  assert.equal(viaSynonym.id, "icon:wrench");
  assert.ok(viaSynonym.score < literal.score);
});

test("business vocabulary reaches a sensible icon", () => {
  // The top hit must be one of the icons the trade actually maps to. Which of
  // them comes first is decided by an alphabetical id tie-break, not by intent
  // (see the "american flag" entry in tests/open-bugs.test.mjs), so pinning a
  // single winner here would be pinning the alphabet.
  for (const [query, acceptable] of [
    ["plumber", ["icon:wrench", "icon:droplet", "icon:pipe-wrench", "icon:pipeline"]],
    // Was ["icon:zap", "icon:wrench"] until the icon-vendoring pass gave
    // electricians their own real icons — resolving to the generic wrench/zap
    // (the same icons a plumber or handyman got) was exactly the sameness bug
    // that work fixed. See lib/assets/index.ts's SYNONYMS comment.
    ["electrician", ["icon:circuit-board", "icon:electric-plug", "icon:zap"]],
    ["barber", ["icon:scissors"]],
    ["dentist", ["icon:tooth"]],
    ["photographer", ["icon:camera"]],
    ["florist", ["icon:sprout", "icon:lotus", "icon:leaf"]],
  ]) {
    const top = findAssets(query, { kind: "icon", limit: 1 })[0]?.id;
    assert.ok(acceptable.includes(top), `${query} -> ${top}, expected one of ${acceptable.join(", ")}`);
  }
});

test("results are sorted by descending score", () => {
  const scores = findAssets("coffee", { limit: 20 }).map((m) => m.score);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] <= scores[i - 1]);
});

test("ties break deterministically by id, so the same query never reshuffles", () => {
  const once = ids(findAssets("flag", { limit: 30 }));
  assert.deepEqual(ids(findAssets("flag", { limit: 30 })), once);
  assert.deepEqual(ids(findAssets("flag", { limit: 30 })), once);
});

test("a query that matches nothing returns nothing, rather than guessing", () => {
  assert.deepEqual(findAssets("zzzzqqqq"), []);
  assert.deepEqual(findAssets("xylophone quantum bagpipe"), []);
});

test("stopwords do not turn a real query into an empty one", () => {
  assert.equal(findAssets("a phone icon", { kind: "icon", limit: 1 })[0].id, "icon:phone");
  assert.equal(findAssets("the icons", { limit: 3 }).length, 3, "an all-stopword query lists the catalogue");
});

// ── Options ────────────────────────────────────────────────────────────────

test("limit is clamped to 1..100", () => {
  assert.equal(findAssets("flag", { limit: 1000 }).length, 100);
  assert.equal(findAssets("flag", { limit: 0 }).length, 1);
  assert.equal(findAssets("flag", { limit: -3 }).length, 1);
  assert.ok(findAssets("flag").length <= 20, "the default limit is 20");
});

test("kind filters the pool", () => {
  for (const kind of ASSET_KINDS) {
    const results = findAssets("", { kind, limit: 100 });
    assert.ok(results.every((m) => m.kind === kind), `kind=${kind} leaked another kind`);
  }
  const two = findAssets("", { kind: ["icon", "flag"], limit: 100 });
  assert.ok(two.every((m) => m.kind === "icon" || m.kind === "flag"));
});

test("an unrecognised kind is ignored rather than returning nothing", () => {
  // Better a slightly wide answer than an empty one from a typo in a tool call.
  assert.ok(findAssets("coffee", { kind: "nonsense", limit: 3 }).length > 0);
  assert.ok(findAssets("coffee", { kind: [], limit: 3 }).length > 0);
});

test("an empty query lists the catalogue instead of erroring", () => {
  const listed = findAssets("", { limit: 5 });
  assert.equal(listed.length, 5);
  assert.ok(listed.every((m) => m.score === 0), "listed items are not scored");
});

test("the icon weight option reaches the emitted source", () => {
  const regular = findAssets("phone", { kind: "icon", limit: 1 })[0].source;
  const bold = findAssets("phone", { kind: "icon", limit: 1, weight: "bold" })[0].source;
  assert.notEqual(regular, bold, "weight had no effect on the emitted markup");
});

// ── Every match must be paste-ready and CSP-safe ───────────────────────────

test("every match carries a non-empty source, usage and format", () => {
  for (const kind of ASSET_KINDS) {
    for (const m of listAssets(kind)) {
      assert.ok(m.source.length > 0, `${m.id} has an empty source`);
      assert.ok(m.usage.length > 0, `${m.id} has no usage line`);
      assert.ok(["jsx", "svg", "css", "text"].includes(m.format), `${m.id} has format ${m.format}`);
      assert.equal(m.kind, kind);
    }
  }
});

test("no source reaches out to a remote host — the sandbox CSP would drop it", () => {
  // Generated sites run under default-src 'self'; img-src 'self' data:. A
  // hosted asset would fail silently at serve time.
  for (const m of listAssets()) {
    assert.ok(
      !/\b(?:src|href)\s*=\s*["']https?:/i.test(m.source),
      `${m.id} references a remote host: ${m.source.slice(0, 120)}`,
    );
  }
});

test("jsx sources use JSX attribute spelling, not HTML", () => {
  for (const m of listAssets()) {
    if (m.format !== "jsx") continue;
    assert.ok(!/\sstroke-width=/.test(m.source), `${m.id} emits HTML-style stroke-width`);
    assert.ok(!/\sstroke-linecap=/.test(m.source), `${m.id} emits HTML-style stroke-linecap`);
    assert.ok(!/\sclass=/.test(m.source), `${m.id} emits class= instead of className=`);
  }
});

// ── Catalogue plumbing ─────────────────────────────────────────────────────

test("ids are unique and namespaced by kind", () => {
  const all = listAssetIds();
  assert.equal(new Set(all).size, all.length, "duplicate asset id");
  for (const id of all) assert.ok(ASSET_KINDS.includes(id.slice(0, id.indexOf(":"))), id);
});

test("getAsset round-trips every id in the catalogue", () => {
  for (const id of listAssetIds()) assert.equal(getAsset(id)?.id, id);
});

test("getAsset trims, and returns null rather than throwing on a bad id", () => {
  assert.equal(getAsset("  icon:phone  ")?.id, "icon:phone");
  assert.equal(getAsset("icon:does-not-exist"), null);
  assert.equal(getAsset(""), null);
  assert.equal(getAsset("constructor"), null);
  assert.equal(getAsset("__proto__"), null);
});

test("the catalogue summary agrees with the catalogue", () => {
  const summary = assetCatalogSummary();
  assert.equal(summary.total, listAssetIds().length);
  assert.equal(
    summary.byKind.reduce((n, k) => n + k.count, 0),
    summary.total,
  );
  for (const { kind, count } of summary.byKind) assert.equal(listAssetIds(kind).length, count);
  assert.equal(summary.flags.withSvg + summary.flags.emojiOnly, summary.flags.total);
});

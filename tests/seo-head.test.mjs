// app/api/projects/[id]/seo/head.ts — the head rewriter behind the SEO panel.
//
// This file was split out of route.ts specifically so it could be tested
// without standing up a request and a session, which is exactly what happens
// here: no Next, no Prisma, no auth.

import test from "node:test";
import assert from "node:assert/strict";

import { applyHead, escapeAttr } from "../app/api/projects/[id]/seo/head.ts";

const doc = (head) => `<!doctype html><html lang="en"><head>${head}</head><body><p>hi</p></body></html>`;

const values = (over = {}) => ({
  title: "Bloom Pilates",
  description: "Reformer classes in Denver.",
  ogTitle: "Bloom Pilates",
  ogDescription: "Reformer classes in Denver.",
  ...over,
});

function attr(html, re, name) {
  const tag = html.match(re);
  if (!tag) return null;
  return tag[0].match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

const title = (html) => html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null;
const description = (html) => attr(html, /<meta\s+name=["']description["'][^>]*>/i, "content");
const ogTitle = (html) => attr(html, /<meta\s+property=["']og:title["'][^>]*>/i, "content");
const ogDescription = (html) => attr(html, /<meta\s+property=["']og:description["'][^>]*>/i, "content");

const countTags = (html, re) => (html.match(re) ?? []).length;

// ── escapeAttr ─────────────────────────────────────────────────────────────

test("escapeAttr: escapes the four characters that can break a double-quoted attribute", () => {
  assert.equal(escapeAttr('&<>"'), "&amp;&lt;&gt;&quot;");
});

test("escapeAttr: the ampersand goes first, so nothing is double-encoded", () => {
  // Escaping < before & would turn "<" into "&lt;" and then into "&amp;lt;".
  assert.equal(escapeAttr("<script>"), "&lt;script&gt;");
  assert.equal(escapeAttr("a & b < c"), "a &amp; b &lt; c");
  assert.ok(!escapeAttr("<>&").includes("&amp;lt;"));
});

// ── No head, no changes ────────────────────────────────────────────────────

test("applyHead: a fragment with no <head> is returned unchanged", () => {
  // Injecting a head into a fragment would produce something worse than what
  // we were handed.
  for (const fragment of ["<p>hi</p>", "", "<html><body>x</body></html>", "just text"]) {
    assert.equal(applyHead(fragment, values()), fragment);
  }
});

test("applyHead: <head> with attributes is still recognised", () => {
  const out = applyHead(`<html><head data-x="1"><title>Old</title></head><body></body></html>`, values());
  assert.equal(title(out), "Bloom Pilates");
  assert.ok(out.includes('<head data-x="1">'));
});

// ── Replacing what is there ────────────────────────────────────────────────

test("applyHead: all four values are written", () => {
  const out = applyHead(
    doc(
      `<title>Old</title>` +
        `<meta name="description" content="old d" />` +
        `<meta property="og:title" content="old ogt" />` +
        `<meta property="og:description" content="old ogd" />`,
    ),
    values({ title: "T", description: "D", ogTitle: "OT", ogDescription: "OD" }),
  );
  assert.equal(title(out), "T");
  assert.equal(description(out), "D");
  assert.equal(ogTitle(out), "OT");
  assert.equal(ogDescription(out), "OD");
});

test("applyHead: single-quoted attributes are matched and replaced, not duplicated", () => {
  // The builder writes both quote styles. An existing tag written with single
  // quotes must be REPLACED — matching only double quotes would inject a
  // second tag and leave two competing descriptions in the document.
  const out = applyHead(
    doc(
      `<title>Old</title>` +
        `<meta name='description' content='old d'>` +
        `<meta property='og:title' content='old ogt'>` +
        `<meta property='og:description' content='old ogd'>`,
    ),
    values({ description: "D", ogTitle: "OT", ogDescription: "OD" }),
  );
  assert.equal(countTags(out, /<meta[^>]+name=["']description["']/gi), 1);
  assert.equal(countTags(out, /<meta[^>]+property=["']og:title["']/gi), 1);
  assert.equal(countTags(out, /<meta[^>]+property=["']og:description["']/gi), 1);
  assert.equal(description(out), "D");
  assert.equal(ogTitle(out), "OT");
  assert.equal(ogDescription(out), "OD");
  assert.ok(!out.includes("old d"));
  assert.ok(!out.includes("old ogt"));
});

test("applyHead: the emitted tags always use double quotes", () => {
  const out = applyHead(doc(`<title>Old</title><meta name='description' content='x'>`), values());
  assert.match(out, /<meta name="description" content="Reformer classes in Denver\." \/>/);
});

// ── Injecting what is missing ──────────────────────────────────────────────

test("applyHead: missing tags are injected inside the head", () => {
  const out = applyHead(doc(`<meta charset="utf-8" />`), values());
  assert.equal(title(out), "Bloom Pilates");
  assert.equal(description(out), "Reformer classes in Denver.");
  assert.equal(ogTitle(out), "Bloom Pilates");
  assert.equal(ogDescription(out), "Reformer classes in Denver.");
  for (const marker of ["<title>", 'name="description"', 'property="og:title"', 'property="og:description"']) {
    assert.ok(out.indexOf(marker) < out.indexOf("</head>"), `${marker} landed outside the head`);
  }
});

test("applyHead: a half-populated head gains only what it lacks", () => {
  const out = applyHead(doc(`<title>Old</title><meta property="og:title" content="keep me" />`), values());
  assert.equal(countTags(out, /<title>/gi), 1);
  assert.equal(countTags(out, /<meta[^>]+property=["']og:title["']/gi), 1);
  assert.equal(countTags(out, /<meta[^>]+name=["']description["']/gi), 1);
  assert.equal(ogTitle(out), "Bloom Pilates");
});

// ── Idempotency ────────────────────────────────────────────────────────────

test("applyHead: applying the same values twice is a no-op", () => {
  const heads = [
    `<meta charset="utf-8" />`,
    `<title>Old</title>`,
    `<title>Old</title><meta name='description' content='old'>`,
    `<title>Old</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" />`,
  ];
  for (const head of heads) {
    const v = values();
    const once = applyHead(doc(head), v);
    assert.equal(applyHead(once, v), once, `not idempotent for head: ${head}`);
  }
});

test("applyHead: repeated application never accumulates duplicate tags", () => {
  let html = doc(`<meta charset="utf-8" />`);
  for (let i = 0; i < 5; i++) html = applyHead(html, values());
  assert.equal(countTags(html, /<title>/gi), 1);
  assert.equal(countTags(html, /<meta[^>]+name=["']description["']/gi), 1);
  assert.equal(countTags(html, /<meta[^>]+property=["']og:title["']/gi), 1);
  assert.equal(countTags(html, /<meta[^>]+property=["']og:description["']/gi), 1);
});

// ── Escaping ───────────────────────────────────────────────────────────────

test("applyHead: values are escaped exactly once", () => {
  const out = applyHead(doc(`<title>Old</title>`), values({ title: "Bloom & Co", description: 'He said "hi"' }));
  assert.equal(title(out), "Bloom &amp; Co");
  assert.ok(!out.includes("&amp;amp;"));
  assert.match(out, /content="He said &quot;hi&quot;"/);
});

test("applyHead: a value containing markup cannot escape its attribute", () => {
  const out = applyHead(doc(`<title>Old</title>`), values({ description: `"><script>alert(1)</script>` }));
  assert.ok(!out.includes("<script>"), "unescaped markup reached the document");
  assert.equal(description(out), "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("applyHead: empty values are written as empty, not skipped", () => {
  const out = applyHead(doc(`<title>Old</title><meta name="description" content="old" />`), {
    title: "",
    description: "",
    ogTitle: "",
    ogDescription: "",
  });
  assert.equal(title(out), "");
  assert.equal(description(out), "");
});

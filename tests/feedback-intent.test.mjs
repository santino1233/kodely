// lib/feedback-intent.ts — coarse buckets for what someone types after a build.
//
// The cost of a single wrong answer is one miscounted row, so these tests are
// about the SHAPE of the rules (plural tolerance, precedence, praise never
// outranking real work), not about pinning every phrase in English.

import test from "node:test";
import assert from "node:assert/strict";

import { INTENTS, classifyFollowUp } from "../lib/feedback-intent.ts";

// ── The plural regression ──────────────────────────────────────────────────

test('"colors" is visual — the \\b after colou?r used to fail on the plural', () => {
  // THE REGRESSION. `\bcolou?r\b` does not match "colors": the trailing word
  // boundary fails against the s, which silently mis-bucketed the single most
  // common visual request in the product.
  assert.equal(classifyFollowUp("make the colors warmer"), "visual");
  assert.equal(classifyFollowUp("the colors are too dark"), "visual");
});

test("both spellings, both numbers, all land on visual", () => {
  for (const word of ["color", "colors", "colour", "colours"]) {
    assert.equal(classifyFollowUp(`change the ${word}`), "visual", word);
  }
});

test("other plural-tolerant visual nouns match in both numbers", () => {
  for (const [singular, plural] of [
    ["font", "fonts"],
    ["background", "backgrounds"],
    ["gradient", "gradients"],
    ["shadow", "shadows"],
    ["margin", "margins"],
    ["theme", "themes"],
  ]) {
    assert.equal(classifyFollowUp(`the ${singular} needs work`), "visual", singular);
    assert.equal(classifyFollowUp(`the ${plural} need work`), "visual", plural);
  }
});

// ── Praise must never outrank real work ────────────────────────────────────

test('"great, now make the colors warmer" is visual, not praise', () => {
  // A change request that opens politely is still a change request.
  assert.equal(classifyFollowUp("great, now make the colors warmer"), "visual");
});

test("a polite opener never swallows the request that follows it", () => {
  assert.equal(classifyFollowUp("perfect, now add a contact form"), "add");
  assert.equal(classifyFollowUp("love it! remove the pricing table"), "remove");
  assert.equal(classifyFollowUp("nice — move the hero above the features"), "layout");
  assert.equal(classifyFollowUp("thanks, but it's blank on mobile"), "broken");
});

test("bare praise is still praise", () => {
  for (const s of ["wow", "this is amazing", "looks great", "thank you", "perfect", "beautiful"]) {
    assert.equal(classifyFollowUp(s), "praise", s);
  }
});

// ── Precedence: broken outranks everything ─────────────────────────────────

test('"broken" wins even when the sentence is phrased as a styling note', () => {
  assert.equal(classifyFollowUp("the colors are broken"), "broken");
  assert.equal(classifyFollowUp("the layout doesn't work"), "broken");
  assert.equal(classifyFollowUp("nice site but the page is blank"), "broken");
});

test("the broken bucket catches the ways people actually report a dead page", () => {
  for (const s of [
    "it's broken",
    "not working",
    "doesn't work",
    "the page is blank",
    "just a white screen",
    "empty page",
    "I get an error",
    "it crashed",
    "there are bugs",
    "nothing loads",
    "won't load",
    "the build failed",
  ]) {
    assert.equal(classifyFollowUp(s), "broken", s);
  }
});

// ── The remaining buckets ──────────────────────────────────────────────────

test("remove outranks add, so a mixed sentence is not counted as growth", () => {
  assert.equal(classifyFollowUp("remove the FAQ"), "remove");
  assert.equal(classifyFollowUp("delete the pricing table and add a gallery"), "remove");
  assert.equal(classifyFollowUp("get rid of the video"), "remove");
  assert.equal(classifyFollowUp("I don't want the testimonials"), "remove");
});

test("add", () => {
  for (const s of ["add a pricing section", "can you add a map", "include opening hours", "create a blog page"]) {
    assert.equal(classifyFollowUp(s), "add", s);
  }
});

test("layout", () => {
  for (const s of ["move the hero up", "swap the sections", "make the logo bigger", "centre the heading", "use two columns"]) {
    assert.equal(classifyFollowUp(s), "layout", s);
  }
});

test("content", () => {
  for (const s of ["fix the spelling", "update the phone number", "the headline is wrong", "change the prices"]) {
    assert.equal(classifyFollowUp(s), "content", s);
  }
});

// ── "other" is a real answer ───────────────────────────────────────────────

test("nothing recognisable is 'other', not a guess", () => {
  // An "other" rate that climbs is the signal that the rules have drifted, so
  // it must not be quietly absorbed into a neighbouring bucket.
  assert.equal(classifyFollowUp("asdfghjkl"), "other");
  assert.equal(classifyFollowUp("hmm"), "other");
});

test("empty and whitespace-only prompts are 'other'", () => {
  assert.equal(classifyFollowUp(""), "other");
  assert.equal(classifyFollowUp("   "), "other");
  assert.equal(classifyFollowUp("\n\t "), "other");
});

// ── Invariants ─────────────────────────────────────────────────────────────

test("classifyFollowUp is case-insensitive", () => {
  assert.equal(classifyFollowUp("MAKE THE COLORS WARMER"), "visual");
  assert.equal(classifyFollowUp("Remove The Footer"), "remove");
});

test("classifyFollowUp always returns a declared intent, and is deterministic", () => {
  const samples = [
    "",
    "great, now make the colors warmer",
    "it's blank",
    "add a gallery",
    "remove the footer",
    "move the hero",
    "fix the phone number",
    "wow",
    "qqqq",
  ];
  for (const s of samples) {
    const first = classifyFollowUp(s);
    assert.ok(INTENTS.includes(first), `${JSON.stringify(s)} -> ${first}`);
    // Regexes carry lastIndex state when they are /g; these must not.
    assert.equal(classifyFollowUp(s), first, `${JSON.stringify(s)} is not stable across calls`);
    assert.equal(classifyFollowUp(s), first);
  }
});

test("leading and trailing whitespace does not change the answer", () => {
  assert.equal(classifyFollowUp("  add a gallery  "), classifyFollowUp("add a gallery"));
});

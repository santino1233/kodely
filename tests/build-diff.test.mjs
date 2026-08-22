// app/projects/[id]/diff.ts — the hand-rolled line diff behind "what changed
// in this build".
//
// The module is pure by construction (no Prisma, no React, no DOM), which is
// the whole reason it is a separate file from the Server Action that calls it.
//
// Two properties get asserted hardest, because they are the ones a
// hand-rolled diff gets wrong quietly:
//
//   1. RECONSTRUCTION. Take the diff, keep every line that exists on the after
//      side, and you must get the after file back exactly. A diff that renders
//      plausibly but cannot rebuild its own target is lying about something.
//   2. LINE NUMBERS. The gutter and the @@ header are read as facts. They are
//      derived from the same DiffLine.a/.b fields, so one test on the numbers
//      covers both — and a wrong number is invisible in a screenshot.

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBudget,
  diffFile,
  diffLines,
  diffTrees,
  sameTree,
  splitLines,
  toHunks,
} from "../app/projects/[id]/diff.ts";

const lines = (...xs) => xs;

/** The after-file, rebuilt from the diff alone. */
function rebuildAfter(diff) {
  return diff.lines.filter((l) => l.op !== "remove").map((l) => l.text);
}

/** The before-file, rebuilt from the diff alone. */
function rebuildBefore(diff) {
  return diff.lines.filter((l) => l.op !== "add").map((l) => l.text);
}

// ── splitLines ─────────────────────────────────────────────────────────────

test("an empty file is zero lines, not one empty line", () => {
  assert.deepEqual(splitLines(""), []);
});

test("the trailing newline every generated file ends with is not a phantom line", () => {
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\nb"), ["a", "b"]);
});

test("a genuinely blank last line survives", () => {
  assert.deepEqual(splitLines("a\n\n"), ["a", ""]);
});

// ── diffLines ──────────────────────────────────────────────────────────────

test("identical files produce context only, and no change at all", () => {
  const d = diffLines(lines("a", "b", "c"), lines("a", "b", "c"));
  assert.equal(d.approximate, false);
  assert.ok(d.lines.every((l) => l.op === "context"));
  assert.deepEqual(
    d.lines.map((l) => [l.a, l.b]),
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
  );
});

test("an inserted line is one add, and everything else stays context", () => {
  const d = diffLines(lines("a", "c"), lines("a", "b", "c"));
  assert.deepEqual(
    d.lines.map((l) => [l.op, l.text]),
    [
      ["context", "a"],
      ["add", "b"],
      ["context", "c"],
    ],
  );
  // The added line exists only on the after side.
  const added = d.lines.find((l) => l.op === "add");
  assert.equal(added.a, null);
  assert.equal(added.b, 2);
});

test("a deleted line is one remove, numbered on the before side only", () => {
  const d = diffLines(lines("a", "b", "c"), lines("a", "c"));
  const removed = d.lines.filter((l) => l.op === "remove");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].text, "b");
  assert.equal(removed[0].a, 2);
  assert.equal(removed[0].b, null);
});

test("a replaced line reads as the old line removed above the new one added", () => {
  const d = diffLines(lines("a", "old", "c"), lines("a", "new", "c"));
  assert.deepEqual(
    d.lines.map((l) => [l.op, l.text]),
    [
      ["context", "a"],
      ["remove", "old"],
      ["add", "new"],
      ["context", "c"],
    ],
  );
});

test("common prefix and suffix keep their real line numbers on both sides", () => {
  // Two lines removed from the middle: the suffix numbers must diverge.
  const before = lines("h1", "h2", "x", "y", "f1", "f2");
  const after = lines("h1", "h2", "f1", "f2");
  const d = diffLines(before, after);
  const suffix = d.lines.filter((l) => l.op === "context" && l.text.startsWith("f"));
  assert.deepEqual(
    suffix.map((l) => [l.text, l.a, l.b]),
    [
      ["f1", 5, 3],
      ["f2", 6, 4],
    ],
  );
});

test("a whole-file rewrite still reconstructs both sides exactly", () => {
  const before = lines("one", "two", "three");
  const after = lines("alpha", "beta");
  const d = diffLines(before, after);
  assert.deepEqual(rebuildBefore(d), before);
  assert.deepEqual(rebuildAfter(d), after);
});

test("a realistic edit reconstructs, and keeps the untouched lines as context", () => {
  const before = splitLines(
    ["<header>", "  <h1>Coffee</h1>", "  <p>Roasted daily</p>", "</header>", ""].join("\n"),
  );
  const after = splitLines(
    [
      "<header>",
      "  <h1>Coffee Roastery</h1>",
      "  <p>Roasted daily</p>",
      "  <a href='#shop'>Shop</a>",
      "</header>",
      "",
    ].join("\n"),
  );
  const d = diffLines(before, after);
  assert.deepEqual(rebuildBefore(d), before);
  assert.deepEqual(rebuildAfter(d), after);
  assert.equal(d.lines.filter((l) => l.op === "add").length, 2);
  assert.equal(d.lines.filter((l) => l.op === "remove").length, 1);
});

test("repeated lines do not get mis-paired", () => {
  const before = lines("x", "x", "x");
  const after = lines("x", "x");
  const d = diffLines(before, after);
  assert.equal(d.lines.filter((l) => l.op === "remove").length, 1);
  assert.equal(d.lines.filter((l) => l.op === "add").length, 0);
  assert.deepEqual(rebuildAfter(d), after);
});

test("an empty side degenerates to all-adds or all-removes without breaking", () => {
  const added = diffLines([], lines("a", "b"));
  assert.deepEqual(
    added.lines.map((l) => l.op),
    ["add", "add"],
  );
  const removed = diffLines(lines("a", "b"), []);
  assert.deepEqual(
    removed.lines.map((l) => l.op),
    ["remove", "remove"],
  );
});

test("a changed region too large for the LCS matrix falls back and SAYS SO", () => {
  // MAX_CELLS is 1e6, so two 1100-line files with nothing in common exceed it.
  // The point of the test is the flag: an approximate diff that did not admit
  // it would overstate the change silently.
  const before = Array.from({ length: 1100 }, (_, i) => `before ${i}`);
  const after = Array.from({ length: 1100 }, (_, i) => `after ${i}`);
  const d = diffLines(before, after);
  assert.equal(d.approximate, true);
  assert.deepEqual(rebuildBefore(d), before);
  assert.deepEqual(rebuildAfter(d), after);
});

test("the fallback still trims the shared prefix, so it only fires on the real change", () => {
  // Identical 2000-line files: the prefix scan consumes everything and the
  // matrix is never allocated, so this must NOT be flagged approximate.
  const same = Array.from({ length: 2000 }, (_, i) => `line ${i}`);
  const d = diffLines(same, [...same]);
  assert.equal(d.approximate, false);
  assert.ok(d.lines.every((l) => l.op === "context"));
});

// ── toHunks ────────────────────────────────────────────────────────────────

test("no change means no hunks — an untouched file renders nothing", () => {
  const d = diffLines(lines("a", "b"), lines("a", "b"));
  assert.deepEqual(toHunks(d.lines), []);
});

test("a hunk carries three lines of context either side and a correct header", () => {
  const before = Array.from({ length: 20 }, (_, i) => `L${i + 1}`);
  const after = [...before];
  after[9] = "CHANGED";
  const hunks = toHunks(diffLines(before, after).lines);
  assert.equal(hunks.length, 1);
  const h = hunks[0];
  // L7..L9 context, remove L10, add CHANGED, L11..L13 context.
  assert.deepEqual(
    h.lines.map((l) => l.op),
    ["context", "context", "context", "remove", "add", "context", "context", "context"],
  );
  assert.equal(h.aStart, 7);
  assert.equal(h.aCount, 7);
  assert.equal(h.bStart, 7);
  assert.equal(h.bCount, 7);
});

test("two changes close together stay in one hunk rather than duplicating context", () => {
  const before = Array.from({ length: 30 }, (_, i) => `L${i + 1}`);
  const after = [...before];
  after[9] = "A";
  after[13] = "B"; // four lines apart: inside 2 * context
  assert.equal(toHunks(diffLines(before, after).lines).length, 1);
});

test("two changes far apart become two hunks", () => {
  const before = Array.from({ length: 60 }, (_, i) => `L${i + 1}`);
  const after = [...before];
  after[9] = "A";
  after[49] = "B";
  const hunks = toHunks(diffLines(before, after).lines);
  assert.equal(hunks.length, 2);
  assert.ok(hunks[0].aStart < hunks[1].aStart);
});

test("a change at the very top does not produce a negative start", () => {
  const hunks = toHunks(diffLines(lines("a", "b", "c"), lines("z", "b", "c")).lines);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].aStart, 1);
  assert.equal(hunks[0].bStart, 1);
});

// ── diffFile ───────────────────────────────────────────────────────────────

test("a new file is `added`, with every line counted and nothing removed", () => {
  const f = diffFile("src/New.tsx", undefined, "one\ntwo\n");
  assert.equal(f.status, "added");
  assert.equal(f.added, 2);
  assert.equal(f.removed, 0);
  assert.equal(f.truncated, false);
});

test("a deleted file is `removed`, with every line counted", () => {
  const f = diffFile("src/Old.tsx", "one\ntwo\nthree\n", undefined);
  assert.equal(f.status, "removed");
  assert.equal(f.added, 0);
  assert.equal(f.removed, 3);
});

test("an edited file is `modified` and counts both sides", () => {
  const f = diffFile("index.html", "a\nb\nc\n", "a\nB\nc\nd\n");
  assert.equal(f.status, "modified");
  assert.equal(f.added, 2);
  assert.equal(f.removed, 1);
});

test("a file too big to render keeps EXACT counts even though the lines are gone", () => {
  // PER_FILE_LINES is 1200. 1500 wholly-different lines blows it.
  const before = Array.from({ length: 1500 }, (_, i) => `b${i}`).join("\n");
  const after = Array.from({ length: 1500 }, (_, i) => `a${i}`).join("\n");
  const f = diffFile("big.txt", before, after);
  assert.equal(f.truncated, true);
  assert.deepEqual(f.hunks, []);
  assert.equal(f.added, 1500);
  assert.equal(f.removed, 1500);
});

// ── diffTrees ──────────────────────────────────────────────────────────────

test("unchanged files are absent from the result entirely", () => {
  const before = { "a.txt": "same", "b.txt": "old" };
  const after = { "a.txt": "same", "b.txt": "new" };
  const files = diffTrees(before, after);
  assert.deepEqual(
    files.map((f) => f.path),
    ["b.txt"],
  );
});

test("added, removed and modified are all detected in one pass, sorted by path", () => {
  const before = { "keep.txt": "x", "gone.txt": "y", "edit.txt": "1\n2\n" };
  const after = { "keep.txt": "x", "edit.txt": "1\n3\n", "brand-new.txt": "hello" };
  const files = diffTrees(before, after);
  assert.deepEqual(
    files.map((f) => [f.path, f.status]),
    [
      ["brand-new.txt", "added"],
      ["edit.txt", "modified"],
      ["gone.txt", "removed"],
    ],
  );
});

test("two empty trees diff to nothing", () => {
  assert.deepEqual(diffTrees({}, {}), []);
});

test("a file that only gained a trailing newline is still reported as changed", () => {
  // splitLines() makes those two identical line-wise, so the diff is empty —
  // but the bytes differ, and diffTrees compares the raw strings to decide
  // whether the file belongs in the result at all.
  const files = diffTrees({ "a.txt": "one" }, { "a.txt": "one\n" });
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "a.txt");
});

// ── applyBudget ────────────────────────────────────────────────────────────

test("the budget drops later files' detail and keeps their counts honest", () => {
  const before = {};
  const after = {};
  // Five files of 400 changed lines each = 2000 lines of detail; a 900-line
  // budget can afford the first two (with their context) and no more.
  for (let f = 0; f < 5; f++) {
    after[`f${f}.txt`] = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
  }
  const files = applyBudget(diffTrees(before, after), 900);
  assert.equal(files.length, 5);
  assert.ok(files[0].hunks.length > 0, "the first file keeps its detail");
  assert.ok(files.at(-1).truncated, "the last file does not");
  // Truncation must never touch the numbers.
  for (const file of files) assert.equal(file.added, 400);
});

test("an already-truncated file is left alone and does not consume budget", () => {
  const file = { path: "x", status: "modified", added: 9, removed: 9, hunks: [], truncated: true, approximate: false };
  const [out] = applyBudget([file], 0);
  assert.equal(out, file);
});

// ── sameTree ───────────────────────────────────────────────────────────────

test("sameTree is exact about content, key count and key identity", () => {
  assert.equal(sameTree({}, {}), true);
  assert.equal(sameTree({ a: "1" }, { a: "1" }), true);
  assert.equal(sameTree({ a: "1" }, { a: "2" }), false);
  assert.equal(sameTree({ a: "1" }, { a: "1", b: "2" }), false);
  assert.equal(sameTree({ a: "1", b: "2" }, { a: "1" }), false);
  // Same size, different keys — the length check alone would pass this.
  assert.equal(sameTree({ a: "1" }, { b: "1" }), false);
});

test("sameTree is not fooled by an inherited property name", () => {
  // `{}.toString` exists on the prototype; a naive `b[key] !== undefined`
  // check would call this pair equal.
  assert.equal(sameTree({ toString: "x" }, {}), false);
});

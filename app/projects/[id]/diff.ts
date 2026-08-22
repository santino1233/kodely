// The diff engine behind "what changed in this build".
//
// Hand-rolled on purpose — no diff library. The inputs are two `filesSnapshot`
// trees (see prisma/schema.prisma), i.e. a handful of small generated files, so
// a plain Myers-free LCS over lines is both fast enough and something we can
// read, test and bound ourselves. A dependency here would be more code shipped
// than written.
//
// Everything in this file is pure: no Prisma, no React, no `window`. That is
// what lets tests/build-diff.test.mjs import it directly, and what lets the
// same module be used from the Server Action (diff-actions.ts) and from
// page.tsx.
//
// Three properties the rest of the feature depends on:
//
//  1. IT NEVER RETURNS AN UNBOUNDED PAYLOAD. The result of a diff is sent from
//     a Server Action to the browser, so a pathological file pair must not be
//     able to turn one build into a multi-megabyte response. Two independent
//     guards do this: `MAX_CELLS` caps the LCS matrix (falling back to a
//     whole-block replace, flagged as `approximate`), and `applyBudget` drops
//     the line detail of files past a total budget (flagged as `truncated`).
//     The +/- counts survive both, so a truncated file still reports honestly
//     how much it changed.
//
//  2. UNCHANGED FILES ARE NOT IN THE RESULT AT ALL. A build that touched one
//     file must not render as a wall of unchanged ones.
//
//  3. LINE NUMBERS ARE 1-BASED AND REAL. `a` is the line number on the BEFORE
//     side, `b` on the AFTER side; each is null on the side where the line does
//     not exist. Hunk headers are derived from those, never counted separately,
//     so the gutter and the header can never disagree.

/** What happened to one line. */
export type LineOp = "context" | "add" | "remove";

export type DiffLine = {
  op: LineOp;
  text: string;
  /** 1-based line number on the before side, or null for an added line. */
  a: number | null;
  /** 1-based line number on the after side, or null for a removed line. */
  b: number | null;
};

/** A contiguous run of changes plus its surrounding context lines. */
export type Hunk = {
  aStart: number;
  aCount: number;
  bStart: number;
  bCount: number;
  lines: DiffLine[];
};

export type FileStatus = "added" | "removed" | "modified";

export type FileDiff = {
  path: string;
  status: FileStatus;
  /** Lines added. Always exact, even when `hunks` has been dropped. */
  added: number;
  /** Lines removed. Always exact, even when `hunks` has been dropped. */
  removed: number;
  hunks: Hunk[];
  /**
   * The line detail was dropped to keep the payload bounded. The counts above
   * are still exact — this only means there is nothing to expand.
   */
  truncated: boolean;
  /**
   * The changed region was too large to run the LCS over, so it is reported as
   * "this block was replaced" rather than matched line by line. The counts are
   * therefore an upper bound on what a human would call a change.
   */
  approximate: boolean;
};

/** Lines of context kept on each side of a change. */
const CONTEXT = 3;

/**
 * Largest LCS matrix we will allocate, in cells. 1e6 cells is a 4 MB
 * Uint32Array and roughly a 1000x1000-line file pair — far beyond anything the
 * generator produces, and the fallback below is graceful rather than wrong.
 */
const MAX_CELLS = 1_000_000;

/** Per-file cap on rendered diff lines. */
const PER_FILE_LINES = 1_200;

/** Cap on rendered diff lines across every file in one build. */
const TOTAL_LINES = 6_000;

/**
 * Split a file into lines for diffing.
 *
 * A trailing newline is dropped rather than becoming a phantom empty last line,
 * because every generated file ends with one and it would otherwise show up as
 * a context line at the bottom of every single diff. An empty file is zero
 * lines, not one empty line.
 */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Longest-common-subsequence diff of two line arrays.
 *
 * The common prefix and suffix are stripped first. That is not just an
 * optimisation: a typical AI edit rewrites one section of one file, so the
 * matrix that actually gets allocated is over the changed middle only, which is
 * usually tiny even when the files are not.
 */
export function diffLines(
  a: string[],
  b: string[],
): { lines: DiffLine[]; approximate: boolean } {
  const lines: DiffLine[] = [];

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  for (let i = 0; i < prefix; i++) {
    lines.push({ op: "context", text: a[i], a: i + 1, b: i + 1 });
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const m = midA.length;
  const n = midB.length;

  let approximate = false;
  if (m * n > MAX_CELLS) {
    // Too big to match line by line. Report the block as replaced — every
    // before-line removed, every after-line added — and flag it so the UI can
    // say so instead of quietly overstating the change.
    approximate = true;
    for (let i = 0; i < m; i++) {
      lines.push({ op: "remove", text: midA[i], a: prefix + i + 1, b: null });
    }
    for (let j = 0; j < n; j++) {
      lines.push({ op: "add", text: midB[j], a: null, b: prefix + j + 1 });
    }
  } else {
    // dp[i][j] = length of the LCS of midA[i..] and midB[j..]. Flat typed array
    // rather than nested arrays: one allocation, and the whole thing is
    // zero-initialised, which is exactly the boundary condition we want.
    const w = n + 1;
    const dp = new Uint32Array((m + 1) * w);
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i * w + j] =
          midA[i] === midB[j]
            ? dp[(i + 1) * w + (j + 1)] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        lines.push({ op: "context", text: midA[i], a: prefix + i + 1, b: prefix + j + 1 });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
        // Tie goes to "removed first", so a replaced line reads as the old line
        // struck out above the new one rather than the other way round.
        lines.push({ op: "remove", text: midA[i], a: prefix + i + 1, b: null });
        i++;
      } else {
        lines.push({ op: "add", text: midB[j], a: null, b: prefix + j + 1 });
        j++;
      }
    }
    while (i < m) {
      lines.push({ op: "remove", text: midA[i], a: prefix + i + 1, b: null });
      i++;
    }
    while (j < n) {
      lines.push({ op: "add", text: midB[j], a: null, b: prefix + j + 1 });
      j++;
    }
  }

  for (let k = 0; k < suffix; k++) {
    const ai = a.length - suffix + k;
    const bi = b.length - suffix + k;
    lines.push({ op: "context", text: a[ai], a: ai + 1, b: bi + 1 });
  }

  return { lines, approximate };
}

function makeHunk(lines: DiffLine[]): Hunk {
  let aStart = 0;
  let bStart = 0;
  let aCount = 0;
  let bCount = 0;
  for (const line of lines) {
    if (line.a !== null) {
      if (aCount === 0) aStart = line.a;
      aCount++;
    }
    if (line.b !== null) {
      if (bCount === 0) bStart = line.b;
      bCount++;
    }
  }
  return { aStart, aCount, bStart, bCount, lines };
}

/**
 * Group a flat line diff into hunks with `context` lines either side.
 *
 * Two changes separated by at most 2*context unchanged lines stay in ONE hunk,
 * because splitting them would print those lines twice — once as trailing
 * context and once as leading context — which reads as a gap that isn't there.
 */
export function toHunks(lines: DiffLine[], context: number = CONTEXT): Hunk[] {
  const changed = (k: number) => lines[k].op !== "context";
  const hunks: Hunk[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!changed(i)) {
      i++;
      continue;
    }

    const start = Math.max(0, i - context);
    let last = i;
    let j = i + 1;
    while (j < lines.length) {
      if (changed(j)) {
        last = j;
        j++;
        continue;
      }
      // A run of unchanged lines. Absorb it only if another change follows
      // closely enough that splitting would duplicate context.
      let k = j;
      while (k < lines.length && !changed(k)) k++;
      if (k < lines.length && k - j <= context * 2) {
        j = k;
        continue;
      }
      break;
    }

    const end = Math.min(lines.length - 1, last + context);
    hunks.push(makeHunk(lines.slice(start, end + 1)));
    i = end + 1;
  }

  return hunks;
}

/** Diff one file. `before`/`after` are undefined when the file did not exist. */
export function diffFile(path: string, before: string | undefined, after: string | undefined): FileDiff {
  const status: FileStatus =
    before === undefined ? "added" : after === undefined ? "removed" : "modified";

  const { lines, approximate } = diffLines(splitLines(before ?? ""), splitLines(after ?? ""));

  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.op === "add") added++;
    else if (line.op === "remove") removed++;
  }

  // A file whose entire content changed produces one hunk per changed region;
  // past PER_FILE_LINES there is nothing a human is going to read anyway, and
  // shipping it would blow the payload for every other file in the build.
  const truncated = lines.length > PER_FILE_LINES;

  return {
    path,
    status,
    added,
    removed,
    hunks: truncated ? [] : toHunks(lines),
    truncated,
    approximate,
  };
}

/**
 * Enforce the whole-build line budget, in place-ish (returns a new array).
 *
 * Files are visited in the order given, so the caller's sort decides who keeps
 * their detail. Counts are never touched — only `hunks` is dropped — so the
 * summary line of a truncated file stays exact.
 */
export function applyBudget(files: FileDiff[], budget: number = TOTAL_LINES): FileDiff[] {
  let spent = 0;
  return files.map((file) => {
    if (file.truncated) return file;
    const cost = file.hunks.reduce((sum, h) => sum + h.lines.length, 0);
    if (spent + cost > budget) return { ...file, hunks: [], truncated: true };
    spent += cost;
    return file;
  });
}

/**
 * Diff two file trees. Unchanged files are omitted entirely — see property 2 at
 * the top of this file.
 *
 * Sorted by path so the same build always renders in the same order, and so the
 * budget above cuts deterministically rather than by whatever order Postgres
 * handed back the JSON keys.
 */
export function diffTrees(
  before: Record<string, string>,
  after: Record<string, string>,
): FileDiff[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: FileDiff[] = [];
  for (const path of [...paths].sort()) {
    if (before[path] === after[path]) continue;
    out.push(diffFile(path, before[path], after[path]));
  }
  return applyBudget(out);
}

// ---------------------------------------------------------------------------
// Wire types.
//
// These live here rather than in diff-actions.ts because a "use server" module
// may only export async functions — and because the client component that
// renders them should be able to `import type` without pulling a Server Action
// reference in with it.
// ---------------------------------------------------------------------------

export type DiffCheckpoint = {
  id: string;
  prompt: string;
  /** ISO string: a Date would have to survive the Server Action boundary. */
  createdAt: string;
};

export type BuildDiff = {
  build: DiffCheckpoint & { filesWritten: number };
  /**
   * The checkpoint this build was compared against, or null when there was
   * nothing to compare against — see `previousPruned` for which of the two
   * reasons applies.
   */
  previous: DiffCheckpoint | null;
  /**
   * True when an earlier successful build DOES exist but its snapshot has been
   * cleared by the retention job, so `files` is the whole tree as it stood
   * after this build rather than only what this build changed. The UI has to
   * say that out loud; presenting it as a change set would be a lie.
   */
  previousPruned: boolean;
  files: FileDiff[];
};

export type BuildDiffResult = { ok: true; diff: BuildDiff } | { ok: false; error: string };

/**
 * Do two trees hold exactly the same files with exactly the same bytes?
 *
 * Used by the editor page to decide whether the draft still matches the newest
 * checkpoint. That question has to be answered exactly rather than inferred
 * from timestamps: it is what makes Undo's label ("back to the last build" vs
 * "undo the last build") a statement of fact instead of a guess.
 */
export function sameTree(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

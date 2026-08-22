// Which published posts still say something that is no longer true.
//
// ── WHERE THE PATTERNS COME FROM ──────────────────────────────────────────
//
// content/seo/corrections/*.json already holds them, as data, because
// scripts/seo/correct-live.mjs needs them: each group carries `detect` (regex
// sources describing the CLAIM being corrected), `ignore` (context windows that
// look like the claim but are a denial of it), a `why` written against the code
// that makes the claim false, and — for export-claim — a `gate` naming the
// deploy that flips it.
//
// This module reads those same files. It writes no patterns of its own except
// the one supplement documented below, and it applies `ignore` with the same
// ±200-character window `correct-live.mjs` uses, so the panel and the corrector
// agree on what counts as a hit.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// It never rewrites anything. correct-live.mjs applies LITERAL, hand-written
// replacements one slug at a time and refuses to guess; this surface is the
// half that was missing — letting a human READ the flagged sentence in context
// and decide. A regex that is good enough to find 56 suspect sentences is
// nowhere near good enough to rewrite them, and the first hit found in the
// local database proves it: "no export negotiation" matches the export-claim
// detector and means the opposite of what the detector is looking for.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A correction group as it sits on disk. Only the fields this page reads. */
type CorrectionGroupFile = {
  group?: unknown;
  why?: unknown;
  gate?: unknown;
  gateWhy?: unknown;
  detect?: unknown;
  ignore?: unknown;
};

export type StaleGroup = {
  /** Group name, e.g. "credit-figure". */
  group: string;
  /** Why the claim is wrong, verbatim from the correction file. */
  why: string;
  /** Set when the correction is only true after a named deploy. */
  gate: string | null;
  gateWhy: string | null;
  /** Where the group is defined, for an operator who wants to read it. */
  source: string;
  match: (bodyHtml: string) => StaleHit[];
};

export type StaleHit = {
  group: string;
  /** The matched text, whitespace flattened. */
  hit: string;
  /** Surrounding prose, whitespace flattened, so the hit can be judged in context. */
  before: string;
  after: string;
};

/** A window of text around a match, flattened onto one line. */
function context(text: string, index: number, length: number, pad: number) {
  return {
    before: text.slice(Math.max(0, index - pad), index).replace(/\s+/g, " "),
    hit: text.slice(index, index + length).replace(/\s+/g, " "),
    after: text.slice(index + length, index + length + pad).replace(/\s+/g, " "),
  };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * A matcher for one correction group's `detect`/`ignore` pair.
 *
 * `ignore` is checked against a ±200-character window, exactly as
 * correct-live.mjs does it — the group files were tuned against that width, and
 * a narrower window would resurrect hits their authors already ruled out.
 */
function regexMatcher(group: string, detect: string[], ignore: string[]) {
  const ignores = ignore.map((source) => new RegExp(source, "i"));
  return (bodyHtml: string): StaleHit[] => {
    const found: { at: number; hit: StaleHit }[] = [];
    for (const source of detect) {
      const re = new RegExp(source, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(bodyHtml)) !== null) {
        // Never loop forever on a zero-width match — same guard as the CLI.
        if (m[0].length === 0) re.lastIndex++;
        const wide = context(bodyHtml, m.index, m[0].length, 200);
        if (ignores.some((ig) => ig.test(`${wide.before}${wide.hit}${wide.after}`))) continue;
        found.push({ at: m.index, hit: { group, ...context(bodyHtml, m.index, m[0].length, 130) } });
      }
    }
    // Document order, so several hits in one post read the way the post does.
    return found.sort((a, b) => a.at - b.at).map((f) => f.hit);
  };
}

/**
 * The one pattern this panel adds on top of the correction files.
 *
 * The brief names three stale claims to flag. Two are already correction
 * groups (`credit-figure`, `export-claim`). The third — a capability TABLE
 * whose export row reads "Not yet" — is not, because correct-live.mjs works in
 * literal replacements and a table cell has no sentence to replace; it needs a
 * human to rewrite the row. It is a two-part condition rather than one regex
 * (a <tr> that is ABOUT export AND says "Not yet"), which is also why it does
 * not fit the `detect` array shape.
 *
 * If it later earns a literal correction, it belongs in
 * content/seo/corrections/ with the others and should be deleted from here.
 */
const EXPORT_ROW_GROUP: StaleGroup = {
  group: "export-row",
  why:
    'A capability table whose export/download/zip row reads "Not yet". True today, false the moment ' +
    "app/api/projects/[id]/export/route.ts deploys — the same inversion export-claim covers for prose, " +
    "which literal find-and-replace cannot reach inside a table cell.",
  gate: "export-shipped",
  gateWhy:
    "Same window as export-claim: correct before the deploy and a true row becomes false; correct long " +
    "after and the table denies a shipped feature.",
  source: "app/admin/content/stale.ts",
  match: (bodyHtml) => {
    const hits: StaleHit[] = [];
    for (const m of bodyHtml.matchAll(/<tr>[\s\S]{0,600}?<\/tr>/gi)) {
      const row = m[0];
      if (!/\bnot yet\b/i.test(row)) continue;
      if (!/\b(zip|export|download|source code)\b/i.test(row)) continue;
      hits.push({
        group: "export-row",
        before: "",
        hit: row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        after: "",
      });
    }
    return hits;
  },
};

/**
 * Every group, loaded fresh on each request.
 *
 * Read from disk rather than imported so that adding a correction file — the
 * normal way a new class of wrong claim gets named — makes it appear here
 * without touching this code. A missing or unreadable directory yields the
 * supplement alone rather than throwing: a panel that 500s because a content
 * file is malformed is a panel nobody can use to fix content.
 */
export function loadStaleGroups(): StaleGroup[] {
  const dir = join(process.cwd(), "content", "seo", "corrections");
  const groups: StaleGroup[] = [];

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    files = [];
  }

  for (const file of files) {
    let raw: CorrectionGroupFile;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as CorrectionGroupFile;
    } catch {
      continue;
    }
    const detect = asStrings(raw.detect);
    if (detect.length === 0) continue;
    const name = typeof raw.group === "string" ? raw.group : file.replace(/\.json$/, "");
    groups.push({
      group: name,
      why: typeof raw.why === "string" ? raw.why : "",
      gate: typeof raw.gate === "string" ? raw.gate : null,
      gateWhy: typeof raw.gateWhy === "string" ? raw.gateWhy : null,
      source: `content/seo/corrections/${file}`,
      match: regexMatcher(name, detect, asStrings(raw.ignore)),
    });
  }

  groups.push(EXPORT_ROW_GROUP);
  return groups;
}

/** Every group's hits against one body, in group order. */
export function sweepBody(bodyHtml: string, groups: StaleGroup[]): StaleHit[] {
  return groups.flatMap((g) => g.match(bodyHtml));
}

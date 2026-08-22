// Applies targeted, reviewable corrections to ALREADY-PUBLISHED BlogPost rows.
//
//   node scripts/seo/correct-live.mjs                      dry run, every ungated group
//   node scripts/seo/correct-live.mjs --apply              write them
//   node scripts/seo/correct-live.mjs --group credit-figure
//   node scripts/seo/correct-live.mjs --gate export-shipped --apply
//   node scripts/seo/correct-live.mjs --emit-stubs         write the residue as a fill-in file
//
// WHY THIS IS NOT seed.mjs
// seed.mjs owns content/seo/*.json — articles whose full text lives in this
// repo. The 56 posts already live on kodely.me do not: their only source of
// truth is the BlogPost table on the production box. There is nothing here to
// diff a whole body against, so a correction has to be a surgical
// find-and-replace on the row's existing bodyHtml.
//
// THE FOUR PROPERTIES THIS IS BUILT AROUND
//
// 1. LITERAL MATCHES ONLY. Every edit is an exact string, never a regex.
//    Regex-rewriting live prose is how you turn one wrong sentence into
//    fifty mangled ones. A literal that no longer matches changes nothing
//    and is reported loudly instead — the failure mode is "did nothing",
//    never "did something surprising".
//
// 2. IDEMPOTENT. An edit whose `find` is gone and whose `replace` is already
//    present is reported as `done` and skipped. Re-running is a no-op, and
//    only bodyHtml is ever written, so @updatedAt does not churn.
//
// 3. NON-DESTRUCTIVE. Updates rows by slug. No create path, no delete path.
//    A slug in the corrections file with no row in the database is reported,
//    not inserted.
//
// 4. IT CHECKS ITS OWN WORK. Each group carries `detect` patterns describing
//    the claim being corrected. After planning, every row in the database is
//    swept for them — including the 42 live posts this repo has no copy of.
//    Residue is printed with context and makes the run exit non-zero, so
//    "the script said OK" cannot mean "some post you forgot still says it".
//
// GATES
// A group with `"gate": "export-shipped"` does not run unless
// `--gate export-shipped` is passed. That is deliberate: those corrections
// are only TRUE once the export route is deployed, so the flag is the
// operator asserting that it is. See content/seo/corrections/README.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadEnv, CONTENT_DIR } from "./lib.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const EMIT_STUBS = ARGV.includes("--emit-stubs");
const CORRECTIONS_DIR = join(CONTENT_DIR, "corrections");

function argValues(flag) {
  const out = [];
  for (let i = 0; i < ARGV.length - 1; i++) if (ARGV[i] === flag) out.push(ARGV[i + 1]);
  return out;
}
const ONLY_GROUPS = argValues("--group");
const OPEN_GATES = new Set(argValues("--gate"));

function loadGroups() {
  if (!existsSync(CORRECTIONS_DIR)) return [];
  return readdirSync(CORRECTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const path = join(CORRECTIONS_DIR, file);
      let raw;
      try {
        raw = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        throw new Error(`${file}: not valid JSON — ${error.message}`);
      }
      for (const field of ["group", "why", "edits"]) {
        if (raw[field] === undefined) throw new Error(`${file}: missing "${field}"`);
      }
      return { file, ...raw };
    });
}

/** A short window of text around an index, flattened onto one line. */
function context(text, index, length, pad = 130) {
  const before = text.slice(Math.max(0, index - pad), index).replace(/\s+/g, " ");
  const hit = text.slice(index, index + length).replace(/\s+/g, " ");
  const after = text.slice(index + length, index + length + pad).replace(/\s+/g, " ");
  return { before, hit, after };
}

function printContext({ before, hit, after }, indent = "      ") {
  console.log(`${indent}…${before}[[${hit}]]${after}…`);
}

/** Every match of every detect pattern, across one body. */
function sweepBody(body, patterns) {
  const hits = [];
  for (const source of patterns) {
    const re = new RegExp(source, "gi");
    let m;
    while ((m = re.exec(body)) !== null) {
      hits.push({ pattern: source, index: m.index, length: m[0].length });
      if (m[0].length === 0) re.lastIndex++; // never loop forever on an empty match
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set, and .env did not provide one.");
    process.exit(1);
  }

  const groups = loadGroups().filter((g) => ONLY_GROUPS.length === 0 || ONLY_GROUPS.includes(g.group));
  if (groups.length === 0) {
    console.error(`No correction groups found in ${CORRECTIONS_DIR}.`);
    process.exit(1);
  }

  const db = new PrismaClient();
  let stale = 0;
  let residue = 0;
  const stubs = [];

  try {
    const rows = await db.blogPost.findMany({ select: { slug: true, bodyHtml: true } });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    // Planned bodies, so the sweep at the end judges the CORRECTED text rather
    // than what is in the database right now.
    const planned = new Map(rows.map((r) => [r.slug, r.bodyHtml]));
    const writes = new Map();

    console.log(
      `${APPLY ? "APPLYING" : "DRY RUN — nothing will be written"} against ${rows.length} BlogPost rows.\n`,
    );

    for (const group of groups) {
      const gated = group.gate && !OPEN_GATES.has(group.gate);
      console.log(`── ${group.group}  (${group.file})`);
      console.log(`   ${group.why}`);
      if (gated) {
        console.log(`   SKIPPED — gated behind --gate ${group.gate}.`);
        if (group.gateWhy) console.log(`   ${group.gateWhy}`);
        console.log("");
        continue;
      }
      if (group.gate) console.log(`   gate ${group.gate}: OPEN (asserted on the command line)`);

      let applied = 0;
      let already = 0;
      for (const edit of group.edits) {
        const row = bySlug.get(edit.slug);
        if (!row) {
          console.log(`   MISSING ROW  ${edit.slug} — no such slug in this database.`);
          stale++;
          continue;
        }
        const body = planned.get(edit.slug);

        if (body.includes(edit.find)) {
          const index = body.indexOf(edit.find);
          console.log(`   change  ${edit.slug}`);
          console.log(`      -  ${edit.find.replace(/\s+/g, " ")}`);
          console.log(`      +  ${edit.replace.replace(/\s+/g, " ")}`);
          if (edit.note) console.log(`      why: ${edit.note}`);
          const next = body.slice(0, index) + edit.replace + body.slice(index + edit.find.length);
          if (next.includes(edit.find)) {
            console.log(`      NOTE: "${edit.slug}" contains this text more than once — rerun to catch the rest.`);
          }
          planned.set(edit.slug, next);
          writes.set(edit.slug, next);
          applied++;
        } else if (edit.replace && body.includes(edit.replace)) {
          already++;
        } else {
          console.log(`   STALE   ${edit.slug} — neither the old text nor the new text is present.`);
          console.log(`      looked for: ${edit.find.replace(/\s+/g, " ").slice(0, 120)}…`);
          console.log("      The live copy has drifted. Re-read the row and rewrite this edit.");
          stale++;
        }
      }
      console.log(`   ${applied} to change, ${already} already corrected.`);

      // ── Sweep every row, not just the ones this group names ───────────────
      if (Array.isArray(group.detect) && group.detect.length > 0) {
        // `ignore` exists because these patterns cannot tell an affirmative
        // claim from a denial of one: an article whose whole point is "a
        // working contact form is exactly what you cannot have" matches the
        // same words as one promising it. Rather than write ever-cleverer
        // negative lookbehinds, a hit whose surrounding context matches an
        // ignore pattern is dropped — and the ignore list is short, explicit
        // and reviewable in the group file.
        const ignores = (group.ignore ?? []).map((source) => new RegExp(source, "i"));
        const found = [];
        for (const [slug, body] of planned) {
          for (const hit of sweepBody(body, group.detect)) {
            const ctx = context(body, hit.index, hit.length, 200);
            const window = `${ctx.before}${ctx.hit}${ctx.after}`;
            if (ignores.some((re) => re.test(window))) continue;
            found.push({ slug, ...hit, ...context(body, hit.index, hit.length) });
          }
        }
        if (found.length > 0) {
          residue += found.length;
          console.log(`\n   RESIDUE — ${found.length} place(s) still matching this group's detect patterns:`);
          for (const f of found) {
            console.log(`    ${f.slug}`);
            printContext(f);
            stubs.push({ group: group.group, slug: f.slug, find: f.hit, replace: "", note: "TODO" });
          }
          console.log("   Each needs a hand-written replacement — this script will not guess one.");
        } else {
          console.log("   sweep clean — no row matches this group's detect patterns.");
        }
      }
      console.log("");
    }

    if (APPLY && writes.size > 0) {
      for (const [slug, bodyHtml] of writes) {
        await db.blogPost.update({ where: { slug }, data: { bodyHtml } });
      }
      console.log(`Wrote ${writes.size} row(s).`);
    } else if (writes.size > 0) {
      console.log(`${writes.size} row(s) would change. Re-run with --apply.`);
    } else {
      console.log("Nothing to change.");
    }

    if (EMIT_STUBS && stubs.length > 0) {
      const out = join(CORRECTIONS_DIR, "pending.generated.json");
      writeFileSync(out, `${JSON.stringify({ note: "Generated by --emit-stubs. Fill in each `replace`, move the entries into the right group file, then delete this file.", edits: stubs }, null, 2)}\n`);
      console.log(`Wrote ${stubs.length} stub(s) to ${out}.`);
    }

    if (stale > 0) console.log(`\n${stale} stale or missing edit(s).`);
    if (residue > 0) console.log(`${residue} uncorrected occurrence(s) still in the database.`);
  } finally {
    await db.$disconnect();
  }

  process.exit(stale + residue > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

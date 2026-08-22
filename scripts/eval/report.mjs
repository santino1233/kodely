#!/usr/bin/env node
// Diff two eval runs. This is the actual point of the harness: a single run
// tells you almost nothing, because there is no absolute standard for "a good
// restaurant page". A DIFF between two runs of the same fixture set tells you
// whether the prompt change you just made helped.
//
//   node scripts/eval/report.mjs results/<before>.json results/<after>.json
//   node scripts/eval/report.mjs results/<run>.json            # summarise one run
//   node scripts/eval/report.mjs a.json b.json --fail-on-regression   # for CI
//   node scripts/eval/report.mjs a.json b.json --json
//
// Runs are noisy: generation is sampled, so a single fixture flipping is not
// evidence. The aggregate lines are what to read; the per-fixture list is for
// finding out WHY an aggregate moved.

import { readFile } from "node:fs/promises";
import path from "node:path";

const HELP = `Compare two golden-set eval runs.

  node scripts/eval/report.mjs <before.json> <after.json> [flags]
  node scripts/eval/report.mjs <run.json>

  --fail-on-regression  exit 1 if any fixture got worse (for CI)
  --json                emit the comparison as JSON instead of a table
  --all                 list every fixture, not just the ones that changed
`;

// Which direction is an improvement, per metric.
const METRICS = [
  { key: "greenFirstTryRate", label: "green build first try", fmt: pct, better: "up" },
  { key: "okRate", label: "compiled at all", fmt: pct, better: "up" },
  { key: "meanScore", label: "mean static score", fmt: pct, better: "up" },
  { key: "meanRepairAttempts", label: "mean repair attempts", fmt: (v) => v.toFixed(2), better: "down" },
  { key: "meanCredits", label: "mean credits / build", fmt: (v) => v.toFixed(0), better: "down" },
  { key: "meanWallMs", label: "mean wall time", fmt: (v) => `${(v / 1000).toFixed(1)}s`, better: "down" },
  { key: "meanFilesWritten", label: "mean files written", fmt: (v) => v.toFixed(1), better: "flat" },
];

function pct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

function parseArgs(argv) {
  const files = [];
  const opts = { failOnRegression: false, json: false, all: false };
  for (const arg of argv) {
    if (arg === "--fail-on-regression") opts.failOnRegression = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--all") opts.all = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else files.push(arg);
  }
  return { files, opts };
}

const load = async (p) => JSON.parse(await readFile(path.resolve(p), "utf8"));
const byId = (run) => new Map(run.results.map((r) => [r.id, r]));

function checkMap(result) {
  return new Map((result.score?.checks ?? []).map((c) => [c.id, c.status]));
}

/**
 * A fixture's verdict, worst to best. Comparing these ranks is what makes
 * "got worse" mean something more useful than a score delta alone: dropping
 * from green to repaired matters more than losing one static check.
 */
function rank(r) {
  if (!r.ok) return 0;
  if (!r.compiledFirstTry) return 1;
  return 2;
}

function compareFixture(before, after) {
  const rankDelta = rank(after) - rank(before);
  const scoreDelta = (after.score?.score ?? 0) - (before.score?.score ?? 0);

  const b = checkMap(before);
  const a = checkMap(after);
  const checksLost = [];
  const checksGained = [];
  for (const [id, status] of a) {
    const prev = b.get(id);
    if (prev === "pass" && status !== "pass" && status !== "skip") checksLost.push(id);
    if (prev && prev !== "pass" && prev !== "skip" && status === "pass") checksGained.push(id);
  }

  let verdict = "same";
  if (rankDelta < 0 || (rankDelta === 0 && (checksLost.length > checksGained.length || scoreDelta < -0.001))) {
    verdict = "worse";
  } else if (rankDelta > 0 || checksGained.length > checksLost.length || scoreDelta > 0.001) {
    verdict = "better";
  }

  return {
    id: after.id,
    verdict,
    rankDelta,
    scoreDelta,
    checksLost,
    checksGained,
    before: {
      ok: before.ok,
      compiledFirstTry: before.compiledFirstTry,
      repairAttempts: before.repairAttempts,
      score: before.score?.score ?? 0,
      credits: before.credits,
      wallMs: before.wallMs,
    },
    after: {
      ok: after.ok,
      compiledFirstTry: after.compiledFirstTry,
      repairAttempts: after.repairAttempts,
      score: after.score?.score ?? 0,
      credits: after.credits,
      wallMs: after.wallMs,
    },
  };
}

function stateLabel(r) {
  if (!r.ok) return "FAILED";
  if (!r.compiledFirstTry) return `repair x${r.repairAttempts}`;
  return "green";
}

function printSingle(run, opts) {
  const a = run.aggregate;
  console.log(`Run: ${run.label}  (${run.startedAt})`);
  console.log(`Engine ${run.engine} / ${run.models?.builder} / effort ${run.effort?.create}`);
  if (run.git?.commit) console.log(`Commit ${run.git.commit}${run.git.dirty ? " (dirty tree)" : ""}`);
  console.log("");
  for (const m of METRICS) {
    console.log(`  ${m.label.padEnd(24)} ${m.fmt(a[m.key] ?? 0).padStart(8)}`);
  }
  console.log(`  ${"total credits".padEnd(24)} ${String(a.totalCredits).padStart(8)}`);
  console.log("\nStatic checks (pass / applicable):");
  for (const [id, t] of Object.entries(a.checkTotals ?? {})) {
    const applicable = (t.pass ?? 0) + (t.fail ?? 0) + (t.error ?? 0);
    console.log(`  ${id.padEnd(24)} ${String(t.pass ?? 0).padStart(3)} / ${applicable}`);
  }
  console.log("\nPer fixture:");
  const rows = [...run.results].sort((x, y) => (x.score?.score ?? 0) - (y.score?.score ?? 0));
  for (const r of rows) {
    const failing = (r.score?.checks ?? []).filter((c) => c.status === "fail" || c.status === "error");
    console.log(
      `  ${r.id.padEnd(32)} ${stateLabel(r).padEnd(11)} ${pct(r.score?.score ?? 0).padStart(4)}` +
        (failing.length ? `  failing: ${failing.map((c) => c.id).join(", ")}` : ""),
    );
    if (opts.all && r.error) console.log(`      error: ${r.error.split("\n")[0].slice(0, 120)}`);
  }
}

function printComparison(before, after, cmp, opts) {
  const arrow = (delta, better) => {
    if (Math.abs(delta) < 1e-9 || better === "flat") return "  ";
    const good = better === "up" ? delta > 0 : delta < 0;
    return good ? "++" : "--";
  };

  // Counted from the results array, not the stored aggregate: the header must
  // describe the file in front of you even if it was hand-edited or truncated.
  console.log(`BEFORE  ${before.label}  ${before.startedAt}  (${before.results.length} fixtures)`);
  console.log(`AFTER   ${after.label}  ${after.startedAt}  (${after.results.length} fixtures)`);
  if (before.git?.commit || after.git?.commit) {
    console.log(`commit  ${before.git?.commit ?? "?"} -> ${after.git?.commit ?? "?"}`);
  }
  if (before.models?.builder !== after.models?.builder || before.effort?.create !== after.effort?.create) {
    console.log(
      `NOTE    model/effort changed between runs: ` +
        `${before.models?.builder}@${before.effort?.create} -> ${after.models?.builder}@${after.effort?.create}`,
    );
  }
  if (cmp.onlyBefore.length || cmp.onlyAfter.length) {
    console.log(
      `NOTE    fixture sets differ; comparing the ${cmp.shared} in common` +
        (cmp.onlyBefore.length ? `  (only before: ${cmp.onlyBefore.join(", ")})` : "") +
        (cmp.onlyAfter.length ? `  (only after: ${cmp.onlyAfter.join(", ")})` : ""),
    );
  }

  console.log(`\nAGGREGATE  (over the ${cmp.shared} shared fixtures)`);
  console.log(`  ${"metric".padEnd(24)} ${"before".padStart(8)} ${"after".padStart(8)}   delta`);
  for (const m of METRICS) {
    const b = cmp.aggBefore[m.key] ?? 0;
    const a = cmp.aggAfter[m.key] ?? 0;
    const d = a - b;
    console.log(
      `  ${m.label.padEnd(24)} ${m.fmt(b).padStart(8)} ${m.fmt(a).padStart(8)}   ` +
        `${arrow(d, m.better)} ${m.fmt(Math.abs(d))}`,
    );
  }

  console.log(`\nSTATIC CHECKS  (fixtures passing, of those where the check applies)`);
  for (const row of cmp.checks) {
    const mark = row.delta > 0 ? "++" : row.delta < 0 ? "--" : "  ";
    console.log(
      `  ${row.id.padEnd(24)} ${`${row.beforePass}/${row.beforeApplicable}`.padStart(8)} ` +
        `${`${row.afterPass}/${row.afterApplicable}`.padStart(8)}   ${mark} ${row.delta > 0 ? "+" : ""}${row.delta}`,
    );
  }

  const groups = [
    ["WORSE", cmp.fixtures.filter((f) => f.verdict === "worse")],
    ["BETTER", cmp.fixtures.filter((f) => f.verdict === "better")],
  ];
  if (opts.all) groups.push(["UNCHANGED", cmp.fixtures.filter((f) => f.verdict === "same")]);

  for (const [heading, rows] of groups) {
    console.log(`\n${heading}  (${rows.length})`);
    if (!rows.length) {
      console.log("  none");
      continue;
    }
    for (const f of rows) {
      const state =
        f.before.ok !== f.after.ok || f.before.compiledFirstTry !== f.after.compiledFirstTry
          ? `${stateLabel(f.before)} -> ${stateLabel(f.after)}`
          : stateLabel(f.after);
      const parts = [`${pct(f.before.score)} -> ${pct(f.after.score)}`, state];
      if (f.checksLost.length) parts.push(`lost: ${f.checksLost.join(", ")}`);
      if (f.checksGained.length) parts.push(`gained: ${f.checksGained.join(", ")}`);
      console.log(`  ${f.id.padEnd(32)} ${parts.join("   ")}`);
    }
  }

  const worse = cmp.fixtures.filter((f) => f.verdict === "worse").length;
  const better = cmp.fixtures.filter((f) => f.verdict === "better").length;
  console.log(
    `\nSUMMARY  ${better} better, ${worse} worse, ` +
      `${cmp.fixtures.length - better - worse} unchanged, of ${cmp.shared} shared fixtures.`,
  );
  if (cmp.shared < 8) {
    console.log(
      "         Small sample: generation is sampled, so treat single-fixture flips as noise.",
    );
  }
}

/** Re-aggregate over only the fixtures present in BOTH runs, so the numbers compare like with like. */
function aggregateSubset(results, ids) {
  const subset = results.filter((r) => ids.has(r.id));
  const n = subset.length;
  const mean = (fn) => (n ? subset.reduce((a, r) => a + (fn(r) || 0), 0) / n : 0);
  return {
    count: n,
    okRate: n ? subset.filter((r) => r.ok).length / n : 0,
    greenFirstTryRate: n ? subset.filter((r) => r.compiledFirstTry).length / n : 0,
    meanScore: mean((r) => r.score?.score ?? 0),
    meanRepairAttempts: mean((r) => r.repairAttempts),
    meanCredits: mean((r) => r.credits),
    meanWallMs: mean((r) => r.wallMs),
    meanFilesWritten: mean((r) => r.filesWritten),
    totalCredits: subset.reduce((a, r) => a + (r.credits || 0), 0),
  };
}

function checkRows(beforeResults, afterResults, ids) {
  const tally = (results) => {
    const out = {};
    for (const r of results) {
      if (!ids.has(r.id)) continue;
      for (const c of r.score?.checks ?? []) {
        const t = (out[c.id] ??= { pass: 0, applicable: 0 });
        if (c.status === "skip") continue;
        t.applicable++;
        if (c.status === "pass") t.pass++;
      }
    }
    return out;
  };
  const b = tally(beforeResults);
  const a = tally(afterResults);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].map((id) => ({
    id,
    beforePass: b[id]?.pass ?? 0,
    beforeApplicable: b[id]?.applicable ?? 0,
    afterPass: a[id]?.pass ?? 0,
    afterApplicable: a[id]?.applicable ?? 0,
    delta: (a[id]?.pass ?? 0) - (b[id]?.pass ?? 0),
  }));
}

async function main() {
  let files, opts;
  try {
    ({ files, opts } = parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help || files.length === 0) {
    console.log(HELP);
    process.exit(files.length === 0 && !opts.help ? 2 : 0);
  }

  if (files.length === 1) {
    printSingle(await load(files[0]), opts);
    return;
  }
  if (files.length > 2) {
    console.error("Pass at most two result files.\n\n" + HELP);
    process.exit(2);
  }

  const [before, after] = await Promise.all(files.map(load));
  const bMap = byId(before);
  const aMap = byId(after);
  const sharedIds = new Set([...aMap.keys()].filter((id) => bMap.has(id)));

  const cmp = {
    shared: sharedIds.size,
    onlyBefore: [...bMap.keys()].filter((id) => !aMap.has(id)),
    onlyAfter: [...aMap.keys()].filter((id) => !bMap.has(id)),
    aggBefore: aggregateSubset(before.results, sharedIds),
    aggAfter: aggregateSubset(after.results, sharedIds),
    checks: checkRows(before.results, after.results, sharedIds),
    fixtures: [...sharedIds].map((id) => compareFixture(bMap.get(id), aMap.get(id))),
  };
  cmp.fixtures.sort((x, y) => x.rankDelta - y.rankDelta || x.scoreDelta - y.scoreDelta);

  if (opts.json) {
    console.log(JSON.stringify({ before: before.label, after: after.label, ...cmp }, null, 2));
  } else {
    printComparison(before, after, cmp, opts);
  }

  if (opts.failOnRegression && cmp.fixtures.some((f) => f.verdict === "worse")) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

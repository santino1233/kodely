// Kodely data retention runner. The policy itself lives in lib/retention.ts —
// this file only decides what to call and how to print it.
//
//   node scripts/retention.mjs                     # dry run (default)
//   node scripts/retention.mjs --only events       # dry run, one rule
//   node scripts/retention.mjs --apply             # actually delete
//   node scripts/retention.mjs --only sessions --apply
//
// --dry-run is the default and needs no flag. Deleting requires typing
// --apply, because the failure mode of getting this backwards is unrecoverable
// and the failure mode of getting it this way round is a wasted SELECT.
//
// Env: DATABASE_URL is read from .env via scripts/eval/loader.mjs, the same
// parser the eval harness uses — Next.js loads .env for you, a bare node
// script does not. Nothing else here is shared with that harness.
import { loadEnv, quietNodeWarnings, registerTsResolution } from "./eval/loader.mjs";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "Usage: node scripts/retention.mjs [--only <rule>] [--apply]",
      "",
      "  (no flags)      Dry run. Counts what each rule would remove. Default.",
      "  --dry-run       Explicit form of the default. Accepted for clarity.",
      "  --only <rule>   Run a single rule by key.",
      "  --apply         ACTUALLY DELETE. Required for any mutation.",
      "",
      "Rule keys are printed in the table below every run.",
    ].join("\n"),
  );
  process.exit(0);
}

const apply = argv.includes("--apply");
const onlyIndex = argv.indexOf("--only");
const only = onlyIndex === -1 ? null : argv[onlyIndex + 1];

if (onlyIndex !== -1 && (!only || only.startsWith("--"))) {
  console.error("--only needs a rule key, e.g. --only events");
  process.exit(1);
}

const unknownFlags = argv.filter(
  (arg, i) =>
    arg.startsWith("--") &&
    !["--apply", "--dry-run", "--only", "--help"].includes(arg) &&
    i !== onlyIndex + 1,
);
if (unknownFlags.length > 0) {
  console.error(`Unrecognized: ${unknownFlags.join(", ")}. Run with --help.`);
  process.exit(1);
}

// loadEnv also insists on KODELY_FOUNDATION_DIR, because the eval harness dies
// confusingly without it. Retention does not touch the foundation at all, so
// that particular complaint is not ours — but the .env values are assigned
// before it throws, so we keep them and check the one variable we do need.
try {
  loadEnv({ quiet: true });
} catch (err) {
  if (!process.env.DATABASE_URL) throw err;
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (looked in .env and the environment).");
  process.exit(1);
}

// Node's type-stripping and typeless-package warnings would otherwise land in
// the middle of the table.
quietNodeWarnings();
registerTsResolution();

const { RETENTION_RULES, NEVER_PRUNED, PRUNED_ELSEWHERE, findRule, BATCH_SIZE } = await import(
  "../lib/retention.ts"
);
const { db } = await import("../lib/db.ts");

const rules = only ? [findRule(only)].filter(Boolean) : RETENTION_RULES;
if (only && rules.length === 0) {
  console.error(
    `No rule named "${only}". Known rules: ${RETENTION_RULES.map((r) => r.key).join(", ")}`,
  );
  process.exit(1);
}

/** Host + database only. The connection string carries a password. */
function describeDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function formatBytes(bytes) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function printTable(rows, columns) {
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((row) => String(col.value(row)).length)),
  );
  const line = (cells) =>
    cells.map((cell, i) => (columns[i].right ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join("  ");

  console.log(line(columns.map((c) => c.header)));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(columns.map((c) => String(c.value(row)))));
}

async function main() {
  console.log("");
  console.log(`Kodely retention · ${apply ? "APPLY (deleting)" : "DRY RUN (nothing is deleted)"}`);
  console.log(`Database: ${describeDatabase()}`);
  console.log(`Rules:    ${rules.map((r) => r.key).join(", ")}`);
  console.log("");

  // Always count first, even under --apply. The operator gets the same table
  // either way, so an --apply run is self-documenting: what it says it removed
  // is measured, not assumed.
  const results = [];
  for (const rule of rules) {
    const counted = await rule.count();
    results.push({ rule, counted, purged: null });
  }

  printTable(results, [
    { header: "RULE", value: (r) => r.rule.key },
    { header: "TARGET", value: (r) => r.rule.target },
    { header: "THRESHOLD", value: (r) => r.rule.threshold },
    { header: "ROWS", value: (r) => r.counted.rows, right: true },
    { header: "OF", value: (r) => r.counted.total, right: true },
    { header: "EST. BYTES", value: (r) => formatBytes(r.counted.bytes), right: true },
  ]);

  console.log("");
  for (const { rule } of results) console.log(`  ${rule.key}: ${rule.rationale}`);

  const affected = results.reduce((sum, r) => sum + r.counted.rows, 0);
  const reclaimable = results.reduce((sum, r) => sum + (r.counted.bytes ?? 0), 0);

  console.log("");
  console.log(`Total: ${affected} row(s), about ${formatBytes(reclaimable)} reclaimable.`);

  if (!apply) {
    console.log("");
    console.log("Dry run — nothing was deleted. Re-run with --apply to enforce the policy.");
    return;
  }

  if (affected === 0) {
    console.log("");
    console.log("Nothing to do.");
    return;
  }

  console.log("");
  console.log(`Applying in batches of ${BATCH_SIZE}...`);
  for (const result of results) {
    if (result.counted.rows === 0) {
      console.log(`  ${result.rule.key}: nothing to remove.`);
      continue;
    }
    const purged = await result.rule.purge();
    result.purged = purged;
    const drift = purged.rows === result.counted.rows ? "" : ` (counted ${result.counted.rows})`;
    console.log(
      `  ${result.rule.key}: ${purged.rows} row(s) in ${purged.batches} batch(es)${drift}` +
        (purged.truncated ? " — STOPPED EARLY, re-run to finish" : ""),
    );
  }

  console.log("");
  console.log(
    "Done. Postgres returns the freed space to each table's free list, not to the\n" +
      "filesystem — autovacuum reclaims it in the background, or run VACUUM by hand if\n" +
      "you need the disk back immediately.",
  );
}

try {
  await main();

  console.log("");
  console.log("Never pruned, by policy:");
  for (const item of NEVER_PRUNED) console.log(`  · ${item.target}`);
  console.log("");
  // Printed every run, next to the rules, because a period this job does not
  // enforce is the easiest kind to forget exists — and the policy document is
  // written from what this file knows.
  console.log("Has a period, enforced elsewhere (not by this job):");
  for (const item of PRUNED_ELSEWHERE) {
    console.log(`  · ${item.target}: ${item.period} — ${item.by}`);
  }
  console.log("  (see docs/retention.md for why)");
  console.log("");
} finally {
  await db.$disconnect();
}

#!/usr/bin/env node
// Golden-set evaluation runner.
//
//   node scripts/eval/run.mjs --only restaurant-italian
//   node scripts/eval/run.mjs --difficulty awkward --concurrency 2 --yes
//   node scripts/eval/run.mjs --list
//
// For each fixture it drives the REAL generation path — runAgent from
// lib/agent.ts, which dispatches to whichever engine KODELY_ENGINE selects —
// then compiles the result with buildSite from lib/build-site.ts, mirroring the
// repair loop in app/api/generate/route.ts. It records whether the site
// compiled first try, how many repairs it took, tokens, imputed cost, wall
// time, files written, and a deterministic static score, into a timestamped
// JSON file under scripts/eval/results/.
//
// It never touches the database. The onWrite/onDelete callbacks that the route
// points at Prisma are pointed at an in-memory FileMap here, and no module that
// instantiates a Prisma client is ever imported (see loader.mjs).
//
// EVERY RUN COSTS REAL TOKENS. The suite is ~30 first builds at `high` effort;
// running all of it is a deliberate act, which is why anything over
// CONFIRM_THRESHOLD fixtures refuses to start without --yes.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { loadKodely, ROOT } from "./loader.mjs";
import { scoreSite, costMicros, creditsFor } from "./score.mjs";

const EVAL_DIR = import.meta.dirname;
const RESULTS_DIR = path.join(EVAL_DIR, "results");

// Mirrors MAX_BUILD_ATTEMPTS in app/api/generate/route.ts. If that changes,
// change it here — the harness is only honest while it repairs the same number
// of times production does.
const MAX_BUILD_ATTEMPTS = 2;

/** Above this many fixtures, --yes is required. Generation costs real money. */
const CONFIRM_THRESHOLD = 5;

const DEFAULT_TIMEOUT_MS = 10 * 60_000;

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    only: [],
    category: null,
    difficulty: null,
    limit: null,
    concurrency: 2,
    label: "run",
    engine: null,
    saveSources: false,
    yes: false,
    list: false,
    out: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--only": opts.only.push(...next().split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--category": opts.category = next(); break;
      case "--difficulty": opts.difficulty = next(); break;
      case "--limit": opts.limit = Number(next()); break;
      case "--concurrency": opts.concurrency = Math.max(1, Number(next())); break;
      case "--label": opts.label = next().replace(/[^A-Za-z0-9._-]/g, "-"); break;
      case "--engine": opts.engine = next(); break;
      case "--timeout": opts.timeoutMs = Number(next()); break;
      case "--out": opts.out = next(); break;
      case "--save-sources": opts.saveSources = true; break;
      case "--yes": case "-y": opts.yes = true; break;
      case "--list": opts.list = true; break;
      case "--help": case "-h": opts.help = true; break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
}

const HELP = `Kodely golden-set evaluation runner

  node scripts/eval/run.mjs [flags]

  --only <id[,id]>    run just these fixtures (repeatable)
  --category <name>   filter by fixture category (restaurant, saas, adversarial, ...)
  --difficulty <name> filter by difficulty (standard | awkward)
  --limit <n>         cap the number of fixtures after filtering
  --concurrency <n>   parallel generations (default 2 — these are expensive)
  --label <name>      goes in the result filename, e.g. --label baseline
  --engine <api|sdk>  override KODELY_ENGINE for this run
  --timeout <ms>      per-fixture wall-clock budget (default 600000)
  --save-sources      embed the generated source files in the result JSON
  --out <file>        write the result here instead of scripts/eval/results/
  --list              print the fixture set and exit, generating nothing
  -y, --yes           required to run more than ${CONFIRM_THRESHOLD} fixtures

Compare two result files with:
  node scripts/eval/report.mjs <before.json> <after.json>
`;

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtMs = (ms) => `${(ms / 1000).toFixed(1)}s`;

function gitInfo() {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  try {
    return { commit: git(["rev-parse", "--short", "HEAD"]), dirty: git(["status", "--porcelain"]).length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** Bounded worker pool. Keeps `limit` generations in flight, in fixture order. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ── one fixture ───────────────────────────────────────────────────────────────

async function runFixture(fixture, kodely, opts) {
  const { runAgent, normalizePath, buildSite, BuildError, FOUNDATION_FILES, MODEL_RATES } = kodely;

  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  // The whole project lives here. This is what the route keeps in Prisma; the
  // harness keeps it in memory so a run can never write to the app database.
  const files = { ...FOUNDATION_FILES };
  const foundationPaths = new Set(Object.keys(FOUNDATION_FILES));

  let filesWritten = 0;
  let repairAttempts = 0;
  let model = "";
  let reply = "";
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const writtenPaths = new Set();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  let dist = null;
  let error = null;
  let buildErrors = [];

  try {
    let request = fixture.prompt;

    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
      if (controller.signal.aborted) break;

      const generator = runAgent({
        history: [],
        request,
        files: { ...files },
        // Always "create": the golden set measures first-build quality, which
        // is the metric the roadmap gates on. Edit-quality would be a second,
        // separate fixture set with a starting FileMap per entry.
        kind: "create",
        signal: controller.signal,
        onWrite: async (p, content) => {
          if (!normalizePath(p)) return false;
          files[p] = content;
          writtenPaths.add(p);
          filesWritten++;
          return true;
        },
        onDelete: async (p) => {
          if (!(p in files)) return false;
          delete files[p];
          return true;
        },
      });

      for await (const event of generator) {
        if (event.type === "text") reply += event.text;
        else if (event.type === "usage") {
          model = event.model;
          totals.inputTokens += event.inputTokens;
          totals.outputTokens += event.outputTokens;
          totals.cacheReadTokens += event.cacheReadTokens;
          totals.cacheWriteTokens += event.cacheWriteTokens;
        }
      }

      if (controller.signal.aborted) break;

      try {
        dist = await buildSite({ ...files });
        break;
      } catch (err) {
        const message = err instanceof BuildError ? err.message : String(err);
        buildErrors.push(message);
        if (attempt >= MAX_BUILD_ATTEMPTS) {
          error = message;
          break;
        }
        repairAttempts++;
        // Verbatim from app/api/generate/route.ts — a repair prompt that
        // differs from production's would measure the wrong thing.
        request = `The last change failed to build. Fix it and keep the rest of the change. Build error:\n${message}`;
      }
    }

    if (controller.signal.aborted && !dist) {
      error = error ?? `Timed out after ${opts.timeoutMs}ms`;
    }
  } catch (err) {
    error = err?.message ?? String(err);
  } finally {
    clearTimeout(timer);
  }

  const wallMs = Math.round(performance.now() - t0);
  const micros = costMicros(MODEL_RATES, model, totals);
  const scored = scoreSite({ source: files, dist, fixture, foundationPaths });

  return {
    id: fixture.id,
    category: fixture.category,
    difficulty: fixture.difficulty,
    prompt: fixture.prompt,
    startedAt,
    ok: Boolean(dist),
    error,
    // The headline metric the roadmap gates on. `false` when the build never
    // compiled at all, so a total failure is never mistaken for a green build.
    compiledFirstTry: Boolean(dist) && repairAttempts === 0,
    repairAttempts,
    buildErrors: buildErrors.map((m) => m.slice(0, 600)),
    wallMs,
    filesWritten,
    filesWrittenPaths: [...writtenPaths].sort(),
    sourceFileCount: Object.keys(files).length,
    distFileCount: dist ? Object.keys(dist).length : 0,
    model,
    usage: totals,
    costMicros: micros,
    credits: creditsFor(micros),
    replyChars: reply.trim().length,
    score: scored,
    ...(opts.saveSources ? { source: files } : {}),
  };
}

// ── aggregate ─────────────────────────────────────────────────────────────────

export function aggregate(results) {
  const n = results.length;
  const sum = (fn) => results.reduce((acc, r) => acc + (fn(r) || 0), 0);
  const mean = (fn) => (n ? sum(fn) / n : 0);
  const okResults = results.filter((r) => r.ok);

  const checkTotals = {};
  for (const r of results) {
    for (const c of r.score?.checks ?? []) {
      const t = (checkTotals[c.id] ??= { pass: 0, fail: 0, error: 0, skip: 0 });
      t[c.status] = (t[c.status] ?? 0) + 1;
    }
  }

  return {
    count: n,
    okCount: okResults.length,
    okRate: n ? okResults.length / n : 0,
    greenFirstTryCount: results.filter((r) => r.compiledFirstTry).length,
    // The kill-criterion metric, over ALL fixtures — a build that never
    // compiled counts against it, exactly as it would for a customer.
    greenFirstTryRate: n ? results.filter((r) => r.compiledFirstTry).length / n : 0,
    meanRepairAttempts: mean((r) => r.repairAttempts),
    meanScore: mean((r) => r.score?.score ?? 0),
    meanScoreOk: okResults.length
      ? okResults.reduce((a, r) => a + (r.score?.score ?? 0), 0) / okResults.length
      : 0,
    meanWallMs: mean((r) => r.wallMs),
    totalCostMicros: sum((r) => r.costMicros),
    meanCostMicros: mean((r) => r.costMicros),
    totalCredits: sum((r) => r.credits),
    meanCredits: mean((r) => r.credits),
    totalOutputTokens: sum((r) => r.usage?.outputTokens),
    meanFilesWritten: mean((r) => r.filesWritten),
    checkTotals,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const fixtureSet = JSON.parse(await readFile(path.join(EVAL_DIR, "prompts.json"), "utf8"));
  const all = fixtureSet.fixtures;

  let selected = all;
  if (opts.only.length) {
    const known = new Set(all.map((f) => f.id));
    const missing = opts.only.filter((id) => !known.has(id));
    if (missing.length) {
      console.error(`Unknown fixture id(s): ${missing.join(", ")}`);
      process.exit(2);
    }
    selected = all.filter((f) => opts.only.includes(f.id));
  }
  if (opts.category) selected = selected.filter((f) => f.category === opts.category);
  if (opts.difficulty) selected = selected.filter((f) => f.difficulty === opts.difficulty);
  if (opts.limit) selected = selected.slice(0, opts.limit);

  if (opts.list) {
    console.log(`${all.length} fixtures (${selected.length} selected)\n`);
    for (const f of selected) {
      const mark = f.difficulty === "awkward" ? "*" : " ";
      console.log(`${mark} ${f.id.padEnd(32)} ${f.category.padEnd(14)} ${f.prompt.slice(0, 70)}...`);
    }
    console.log(`\n* = deliberately awkward fixture`);
    return;
  }

  if (!selected.length) {
    console.error("No fixtures matched the filters.");
    process.exit(2);
  }

  if (selected.length > CONFIRM_THRESHOLD && !opts.yes) {
    console.error(
      `Refusing to run ${selected.length} fixtures without --yes.\n` +
        `Each one is a full first build against a real model. Narrow it with ` +
        `--only/--difficulty/--limit, or pass --yes if you mean it.`,
    );
    process.exit(2);
  }

  if (opts.engine) process.env.KODELY_ENGINE = opts.engine;

  const kodely = await loadKodely();

  const runStartedAt = new Date();
  const stamp = runStartedAt.toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(RESULTS_DIR, `${stamp}-${opts.label}.json`);

  console.log(
    `[eval] ${selected.length} fixture(s), engine=${kodely.ENGINE}, ` +
      `builder=${kodely.MODELS.builder}, effort(create)=${kodely.EFFORT.create}, ` +
      `concurrency=${opts.concurrency}`,
  );
  console.log(`[eval] results -> ${outPath}\n`);

  let done = 0;
  const results = await pool(selected, opts.concurrency, async (fixture) => {
    const result = await runFixture(fixture, kodely, opts);
    done++;
    const verdict = !result.ok
      ? "FAILED"
      : result.compiledFirstTry
        ? "green"
        : `repaired x${result.repairAttempts}`;
    console.log(
      `[${String(done).padStart(2)}/${selected.length}] ${result.id.padEnd(32)} ` +
        `${verdict.padEnd(13)} score ${(result.score.score * 100).toFixed(0).padStart(3)}% ` +
        `${String(result.score.passed)}/${result.score.applicable} checks  ` +
        `${fmtMs(result.wallMs).padStart(7)}  ${result.credits} cr` +
        (result.error ? `  :: ${result.error.split("\n")[0].slice(0, 90)}` : ""),
    );
    return result;
  });

  const payload = {
    schemaVersion: 1,
    label: opts.label,
    startedAt: runStartedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    engine: kodely.ENGINE,
    models: { ...kodely.MODELS },
    effort: { ...kodely.EFFORT },
    concurrency: opts.concurrency,
    fixtureSetVersion: fixtureSet.version,
    selectedIds: selected.map((f) => f.id),
    git: gitInfo(),
    node: process.version,
    aggregate: aggregate(results),
    results,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

  const a = payload.aggregate;
  console.log(
    `\n[eval] green-build-first-try ${(a.greenFirstTryRate * 100).toFixed(0)}% ` +
      `(${a.greenFirstTryCount}/${a.count})   compiled ${a.okCount}/${a.count}   ` +
      `mean score ${(a.meanScore * 100).toFixed(0)}%   ` +
      `mean ${fmtMs(a.meanWallMs)}   ${a.totalCredits} credits total`,
  );
  console.log(`[eval] wrote ${outPath}`);
  console.log(`[eval] compare with: node scripts/eval/report.mjs <baseline.json> ${path.relative(ROOT, outPath).replace(/\\/g, "/")}`);
}

// Only run when invoked directly, so `aggregate` and `pool` can be imported
// (and tested) without kicking off a suite as a side effect of the import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { pool, runFixture };

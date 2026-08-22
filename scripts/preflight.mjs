#!/usr/bin/env node
// Deploy preflight for kodely.me — READ ONLY.
//
//   node scripts/preflight.mjs            human-readable report
//   node scripts/preflight.mjs --json     machine-readable, for scripting
//   node scripts/preflight.mjs --strict   warnings also make the exit non-zero
//   node scripts/preflight.mjs --no-prisma-diff
//                                         force the information_schema fallback
//                                         for the drift check (see below)
//
// EXIT CODES
//   0  nothing blocking (warnings may still be listed — read them)
//   1  at least one BLOCKER
//   2  warnings only, and --strict was passed
//   3  the checker itself failed to run
//
// Why warnings do not fail by default: several of them are correct states in
// some environments (billing is deliberately off on staging, the local .next is
// irrelevant because deploy.sh builds on the VM). A tool that cries wolf gets
// `|| true`-d into uselessness, and a bypassed checker catches nothing. Use
// --strict in CI where the environment is known.
//
// WHAT THIS NEVER DOES
//   - no writes of any kind: no migration, no `db push`, no `git fetch`, no
//     deploy, no file it creates. Every git command below is a read
//     (`ls-remote` contacts the remote but updates no ref); every database
//     statement is a SELECT or a Prisma read.
//   - never prints an environment variable's VALUE, masked or otherwise. Env
//     vars appear by NAME only. The one identifying detail it prints about the
//     database is `current_database()` — a value the server reports back, not a
//     substring of DATABASE_URL — because "am I pointed at prod?" is the
//     question the runbook says gets answered wrong at 3am.
//
// The hazards each check exists for are written up in docs/ops/preflight.md.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.includes("--json");
const STRICT = ARGV.includes("--strict");
const NO_PRISMA_DIFF = ARGV.includes("--no-prisma-diff");
const COLOR = !JSON_OUT && !ARGV.includes("--no-color") && process.stdout.isTTY;

// ── tiny helpers ───────────────────────────────────────────────────────────

const c = (code, s) => (COLOR ? `\u001b[${code}m${s}\u001b[0m` : s);
const red = (s) => c("31", s);
const yellow = (s) => c("33", s);
const green = (s) => c("32", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

/** Collected results. One entry per check. */
const checks = [];

/**
 * @param {{id:string,title:string,status:"pass"|"warn"|"fail"|"skip",
 *          summary:string, detail?:string[], remedy?:string}} r
 */
function record(r) {
  checks.push({ detail: [], remedy: null, ...r });
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
    error: res.error ?? null,
  };
}

const git = (...args) => run("git", args);

// ── .env loading ───────────────────────────────────────────────────────────
//
// Deliberately the same minimal reader the SEO pipeline uses (scripts/seo/lib.mjs)
// rather than a dependency, and imported rather than copied so there is one
// definition. Next.js precedence: an already-set process env wins, then
// .env.local, then .env — so .env.local is offered first because loadEnv never
// overwrites what is already defined.
const { loadEnv } = await import("./seo/lib.mjs");
for (const f of [".env.local", ".env"]) loadEnv(join(ROOT, f));

const isSet = (name) => typeof process.env[name] === "string" && process.env[name].length > 0;
const isEmptyString = (name) => process.env[name] === "";

// ═══════════════════════════════════════════════════════════════════════════
// 1. git — is this checkout the thing that is about to ship?
// ═══════════════════════════════════════════════════════════════════════════

const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout;
const headSha = git("rev-parse", "HEAD").stdout;
const headShort = git("rev-parse", "--short", "HEAD").stdout;

function checkBranch() {
  if (branch === "main") {
    record({ id: "git-branch", title: "On branch main", status: "pass", summary: `main @ ${headShort}` });
    return;
  }
  record({
    id: "git-branch",
    title: "On branch main",
    status: "fail",
    summary: `HEAD is on "${branch}", not main`,
    remedy: "git switch main — deploy.sh aborts on anything else, and the bundle it cuts is `BASE..main`, so a non-main HEAD ships something you did not verify.",
  });
}

function checkClean() {
  const porcelain = git("status", "--porcelain").stdout;
  if (!porcelain) {
    record({ id: "git-clean", title: "Working tree clean", status: "pass", summary: "no uncommitted changes" });
    return;
  }
  const lines = porcelain.split(/\r?\n/);
  const untracked = lines.filter((l) => l.startsWith("??")).length;
  record({
    id: "git-clean",
    title: "Working tree clean",
    status: "fail",
    summary: `${lines.length} uncommitted change(s)${untracked ? ` (${untracked} untracked)` : ""}`,
    detail: lines.slice(0, 12).map((l) => l.trim()),
    remedy: "Commit or stash. deploy.sh dies on a dirty tree, and — worse — it ships COMMITS, so anything uncommitted is silently absent from the deploy while still being what you tested locally.",
  });
}

// The stale-ref hazard, from this side of it.
//
// The VM's own /home/kodely/deploy.sh does `git fetch && git reset --hard
// origin/main`; when the fetch fails (the VM cannot reach GitHub over SSH) the
// reset lands on a STALE remote-tracking ref and reports a healthy deploy of
// the wrong commit. That shipped twice on 2026-08-21. This repo's deploy.sh
// avoids it by transporting a bundle, but the same class of mistake exists
// here: `refs/remotes/origin/main` in THIS checkout is only as fresh as the
// last successful fetch, and every comparison below would otherwise be made
// against a cached answer.
//
// So: ask the remote directly with `git ls-remote`, which is read-only (it
// prints refs and updates nothing), and compare all three of real-remote /
// cached-ref / HEAD.
function checkRemote() {
  const cachedRef = git("rev-parse", "refs/remotes/origin/main");
  const cached = cachedRef.ok ? cachedRef.stdout : null;

  const ls = run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"], {
    timeout: 20_000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "true",
      GCM_INTERACTIVE: "never",
    },
  });

  if (!ls.ok) {
    record({
      id: "git-remote",
      title: "HEAD matches the real origin/main",
      status: "warn",
      summary: "cannot reach origin — freshness of the cached ref is unverifiable",
      detail: [
        cached
          ? `cached refs/remotes/origin/main = ${cached.slice(0, 7)} (age unknown)`
          : "no cached refs/remotes/origin/main at all",
        ls.stderr ? ls.stderr.split(/\r?\n/)[0] : `git ls-remote exited ${ls.status}`,
      ],
      remedy: "Restore network access to origin and re-run. Until then you cannot rule out that the ref you are comparing against is stale — which is the exact failure that shipped the wrong commit twice on 2026-08-21. deploy.sh will refuse anyway: it does its own `git fetch origin main` and dies with \"cannot reach GitHub from here\".",
    });
    return;
  }

  const remote = ls.stdout.split(/\s+/)[0];
  const detail = [`origin/main (live)  ${remote.slice(0, 7)}`, `HEAD                ${headShort}`];

  if (cached && cached !== remote) {
    detail.push(`cached ref          ${cached.slice(0, 7)}  ← STALE`);
  }

  if (remote === headSha) {
    record({
      id: "git-remote",
      title: "HEAD matches the real origin/main",
      status: cached === remote ? "pass" : "warn",
      summary:
        cached === remote
          ? `in sync at ${headShort}`
          : `HEAD matches the live remote, but this checkout's cached origin/main is stale`,
      detail,
      remedy: cached === remote ? null : "git fetch origin main — harmless, but every tool that reads refs/remotes/origin/main (including a human running `git log origin/main..HEAD`) is currently answering from a stale cache.",
    });
    return;
  }

  const behind = git("rev-list", "--count", `${headSha}..${remote}`);
  const ahead = git("rev-list", "--count", `${remote}..${headSha}`);
  const nBehind = behind.ok ? Number(behind.stdout) : NaN;
  const nAhead = ahead.ok ? Number(ahead.stdout) : NaN;

  // `rev-list` needs the remote commit locally. If it is not here, we are
  // behind by an unknown amount and have not fetched it — same conclusion.
  if (!behind.ok || nBehind > 0) {
    record({
      id: "git-remote",
      title: "HEAD matches the real origin/main",
      status: "fail",
      summary: behind.ok
        ? `origin/main is ${nBehind} commit(s) ahead of HEAD`
        : "origin/main points at a commit this checkout does not have",
      detail,
      remedy: "git fetch origin main && git rebase origin/main. Someone pushed work you do not have; shipping now either deploys a tree missing their commits, or fails at deploy.sh's `git push`.",
    });
    return;
  }

  record({
    id: "git-remote",
    title: "HEAD matches the real origin/main",
    status: "pass",
    summary: `${nAhead} commit(s) ahead of origin/main — deploy.sh will push them`,
    detail,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Database — reachability, schema drift, and an ADMIN account
// ═══════════════════════════════════════════════════════════════════════════

/** @type {import("@prisma/client").PrismaClient | null} */
let db = null;
let dbReachable = false;

async function connectDb() {
  if (!isSet("DATABASE_URL")) {
    record({
      id: "db-reachable",
      title: "Database answers a real query",
      status: "fail",
      summary: "DATABASE_URL is not set — nothing to connect to",
      remedy: "Set DATABASE_URL in this directory's .env. The Prisma CLI and the app both read it from the working directory, which is why the runbook insists on `cd /opt/kodely` before `db push`.",
    });
    return;
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient();
  } catch (err) {
    record({
      id: "db-reachable",
      title: "Database answers a real query",
      status: "fail",
      summary: "@prisma/client could not be loaded",
      detail: [String(err?.message ?? err).split(/\r?\n/)[0]],
      remedy: "npm ci (the postinstall hook runs `prisma generate`). Without a generated client nothing in the app can talk to the database either.",
    });
    return;
  }

  // A REAL query, not a connection open. /api/health's whole problem is that
  // "the process is up" and "the database works" are different facts, and
  // deploy.sh's verification only ever establishes the first one.
  try {
    const rows = await db.$queryRaw`SELECT current_database() AS db, now() AS at`;
    dbReachable = true;
    record({
      id: "db-reachable",
      title: "Database answers a real query",
      status: "pass",
      // Database NAME only, and it comes from the server's answer rather than
      // from parsing DATABASE_URL. No host, no user, no credential.
      summary: `SELECT succeeded against "${rows[0].db}"`,
      detail: ["Confirm that database name is the one you mean to deploy against."],
    });
  } catch (err) {
    record({
      id: "db-reachable",
      title: "Database answers a real query",
      status: "fail",
      summary: "the database did not answer",
      // Prisma's message is mostly blank lines and a re-print of the call. Keep
      // the lines that say something — "Can't reach database server at host:port"
      // is the one that matters, and it carries no credential.
      detail: firstMeaningfulLines(sanitize(String(err?.message ?? err)), 3),
      remedy: "Fix this before anything else. Note that deploy.sh would NOT catch it: /api/health returns a static JSON object and touches no dependency, and /, /pricing, /blog, /contact are static marketing pages — the whole verification suite passes with the database unreachable.",
    });
  }
}

/** Strip anything that could carry a credential out of an error string. */
function sanitize(s) {
  return s.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1<redacted>@");
}

/** The first `n` lines that actually say something. */
function firstMeaningfulLines(s, n) {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Invalid `.*` invocation/.test(l))
    .slice(0, n);
}

// ── schema drift ───────────────────────────────────────────────────────────
//
// HOW THIS IS DONE, AND WHY
//
// Primary: `prisma migrate diff --from-schema-datasource prisma/schema.prisma
//           --to-schema-datamodel prisma/schema.prisma --script`
//
// It introspects the live database and prints the SQL that would be needed to
// turn it into what schema.prisma declares. Empty script = no drift. It is the
// right tool here for four reasons:
//
//   1. It needs NO shadow database. A shadow DB is only required when a
//      migration HISTORY has to be replayed (`--from-migrations` /
//      `--to-migrations`). Both endpoints here are direct — a live datasource
//      and a datamodel file — so nothing is replayed and nothing is created.
//      Confirmed against this checkout: it runs clean with no
//      --shadow-database-url and no CREATEDB rights.
//   2. It is read-only. `migrate diff` computes and prints; only `migrate dev`
//      / `db push` write.
//   3. It knows the whole surface — types, defaults, nullability, indexes,
//      unique constraints, enums — not just "does a column with this name
//      exist". A hand-rolled information_schema comparison quietly misses a
//      column that exists with the wrong type, which is exactly the failure a
//      `db push` that was interrupted halfway leaves behind.
//   4. `--from-schema-datasource` reads DATABASE_URL out of the schema's
//      datasource block, so the connection string never appears in argv and
//      never lands in a process listing. (`--from-url <url>` would.)
//
// Fallback: an information_schema comparison against a parsed schema.prisma,
// used when the CLI is absent or errors for a non-connectivity reason, and
// forceable with --no-prisma-diff. It is coarser — presence of tables and
// columns only, no types — so it is reported as such rather than pretending to
// be the same answer.
//
// DIRECTION MATTERS, and this is the whole point of the check. Every change in
// this release is additive, so:
//   - DB missing something the schema declares  = code-ahead-of-schema = BLOCKER.
//     This is the failure mode: new code selects a table that is not there and
//     dies at runtime on login, on every analytics write, on every admin page.
//   - DB has something the schema does not      = schema-ahead-of-code = fine.
//     Reported as a warning because it usually means a `db push` from a branch,
//     but it does not break the deploy, and the runbook is explicit that schema
//     is never rolled back.

const PRISMA_CLI = join(ROOT, "node_modules", "prisma", "build", "index.js");

function prismaDiff() {
  if (!existsSync(PRISMA_CLI)) return { available: false, reason: "prisma CLI not installed" };
  const res = run(process.execPath, [
    PRISMA_CLI,
    "migrate",
    "diff",
    "--from-schema-datasource",
    join("prisma", "schema.prisma"),
    "--to-schema-datamodel",
    join("prisma", "schema.prisma"),
    "--script",
  ], { timeout: 120_000 });

  if (!res.ok) {
    return { available: false, reason: sanitize(res.stdout || res.stderr || `exited ${res.status}`) };
  }
  return { available: true, sql: res.stdout };
}

/** Pull human-readable object names out of the migration script. */
function classifySql(sql) {
  const missing = [];
  const extra = [];
  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;

    let m;
    if ((m = line.match(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(?:\w+"?\."?)?"?([\w.]+)"?/i))) {
      missing.push(`table ${m[1]}`);
    } else if ((m = line.match(/^ALTER TABLE\s+"?(?:\w+"?\."?)?"?([\w.]+)"?\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([\w.]+)"?/i))) {
      missing.push(`column ${m[1]}.${m[2]}`);
    } else if ((m = line.match(/^CREATE(?:\s+UNIQUE)?\s+INDEX\s+(?:IF NOT EXISTS\s+)?"?([\w.]+)"?/i))) {
      missing.push(`index ${m[1]}`);
    } else if ((m = line.match(/^CREATE TYPE\s+"?(?:\w+"?\."?)?"?([\w.]+)"?/i))) {
      missing.push(`enum ${m[1]}`);
    } else if ((m = line.match(/^ALTER TABLE\s+"?(?:\w+"?\."?)?"?([\w.]+)"?\s+DROP COLUMN\s+(?:IF EXISTS\s+)?"?([\w.]+)"?/i))) {
      extra.push(`column ${m[1]}.${m[2]}`);
    } else if ((m = line.match(/^DROP TABLE\s+(?:IF EXISTS\s+)?"?(?:\w+"?\."?)?"?([\w.]+)"?/i))) {
      extra.push(`table ${m[1]}`);
    } else if ((m = line.match(/^DROP INDEX\s+(?:IF EXISTS\s+)?"?([\w.]+)"?/i))) {
      extra.push(`index ${m[1]}`);
    } else if (/^ALTER TABLE\b/i.test(line)) {
      // ALTER COLUMN ... SET NOT NULL / TYPE / DROP DEFAULT etc. Direction is
      // not inferable from the name alone, so treat it as a mismatch that
      // needs a human — safer than guessing "harmless".
      missing.push(line.replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return { missing: [...new Set(missing)], extra: [...new Set(extra)] };
}

// ── information_schema fallback ────────────────────────────────────────────

const SCALARS = new Set([
  "String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime", "Json", "Bytes",
]);

/** Minimal schema.prisma parser: model -> table, scalar fields -> columns. */
function parsePrismaSchema(src) {
  const modelNames = new Set([...src.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const enumNames = new Set([...src.matchAll(/^\s*enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const models = [];

  for (const m of src.matchAll(/^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)) {
    const [, name, body] = m;
    let table = name;
    const cols = [];

    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;

      const mapModel = line.match(/^@@map\(\s*"([^"]+)"\s*\)/);
      if (mapModel) { table = mapModel[1]; continue; }
      if (line.startsWith("@@")) continue;

      const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!field) continue;
      const [, fieldName, baseType, isList, , rest] = field;

      // Relation fields are not columns. The foreign key itself is declared as
      // its own scalar field in this schema, so dropping these loses nothing.
      if (modelNames.has(baseType)) continue;
      if (!SCALARS.has(baseType) && !enumNames.has(baseType)) continue;
      if (isList) continue;

      const mapField = rest.match(/@map\(\s*"([^"]+)"\s*\)/);
      cols.push(mapField ? mapField[1] : fieldName);
    }
    models.push({ model: name, table, cols });
  }
  return models;
}

async function informationSchemaDrift() {
  const src = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
  const models = parsePrismaSchema(src);

  const rows = await db.$queryRaw`
    SELECT table_name AS t, column_name AS c
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  /** @type {Map<string, Set<string>>} */
  const live = new Map();
  for (const r of rows) {
    if (!live.has(r.t)) live.set(r.t, new Set());
    live.get(r.t).add(r.c);
  }

  const missing = [];
  for (const { table, cols } of models) {
    const liveCols = live.get(table);
    if (!liveCols) { missing.push(`table ${table}`); continue; }
    for (const col of cols) if (!liveCols.has(col)) missing.push(`column ${table}.${col}`);
  }

  const declared = new Set(models.map((m) => m.table));
  const extra = [...live.keys()].filter((t) => !declared.has(t)).map((t) => `table ${t}`);

  return { missing, extra, modelCount: models.length };
}

async function checkSchemaDrift() {
  if (!dbReachable) {
    record({
      id: "schema-drift",
      title: "Database schema matches prisma/schema.prisma",
      status: "skip",
      summary: "skipped — the database is not reachable",
    });
    return;
  }

  const hasMigrationsDir = existsSync(join(ROOT, "prisma", "migrations"));
  const mechanism = hasMigrationsDir
    ? "prisma/migrations/ exists now — `migrate deploy` may have become the mechanism; re-read the runbook."
    : "There is no prisma/migrations/ directory, so `prisma db push` is the mechanism and deploy.sh runs it nowhere. Ordering is the only safety net.";

  const diff = NO_PRISMA_DIFF ? { available: false, reason: "--no-prisma-diff" } : prismaDiff();

  let missing, extra, method, coarse = false;
  if (diff.available) {
    ({ missing, extra } = classifySql(diff.sql));
    method = "prisma migrate diff (no shadow database required)";
  } else {
    try {
      ({ missing, extra } = await informationSchemaDrift());
      coarse = true;
      method = `information_schema fallback — prisma migrate diff unavailable: ${diff.reason}`;
    } catch (err) {
      record({
        id: "schema-drift",
        title: "Database schema matches prisma/schema.prisma",
        status: "fail",
        summary: "drift could not be determined by either method",
        detail: [`prisma migrate diff: ${diff.reason}`, `information_schema: ${sanitize(String(err?.message ?? err))}`],
        remedy: "Do not deploy blind. This is the check that stands between the release and code-ahead-of-schema. " + mechanism,
      });
      return;
    }
  }

  const detail = [dim(`method: ${method}`)];
  if (coarse) {
    detail.push(dim("coarse: presence of tables and columns only — column TYPES are not compared."));
  }

  if (missing.length) {
    record({
      id: "schema-drift",
      title: "Database schema matches prisma/schema.prisma",
      status: "fail",
      summary: `${missing.length} object(s) the code expects are NOT in the database`,
      detail: [...detail, ...missing.slice(0, 30), ...(missing.length > 30 ? [`… and ${missing.length - 30} more`] : [])],
      remedy:
        "Push the schema to THIS environment before the code reaches it:\n" +
        "      cd <the checkout whose .env points at this database>\n" +
        "      npx prisma db push --schema /tmp/kodely-schema.prisma --skip-generate\n" +
        "    Read the printed plan first: only CREATE TABLE / ADD COLUMN / CREATE INDEX is expected. " +
        "If it proposes a DROP or an ALTER, stop — the target has drifted and pushing loses data. Never --accept-data-loss.\n" +
        "    " + mechanism,
    });
    return;
  }

  if (extra.length) {
    record({
      id: "schema-drift",
      title: "Database schema matches prisma/schema.prisma",
      status: "warn",
      summary: `in sync for everything the code needs; ${extra.length} object(s) exist that the schema no longer declares`,
      detail: [...detail, ...extra.slice(0, 20)],
      remedy: "Safe to deploy — the running code cannot select what it does not declare. This is the expected shape after a code rollback (the runbook is explicit that schema is never rolled back) or after a `db push` from a branch. Do NOT drop them to tidy up.",
    });
    return;
  }

  record({
    id: "schema-drift",
    title: "Database schema matches prisma/schema.prisma",
    status: "pass",
    // The method belongs in the summary, not just the detail: "no drift" from
    // the coarse fallback is a weaker claim than "no drift" from migrate diff,
    // and the reader has to be able to tell which one they got.
    summary: `no drift in either direction — via ${coarse ? "information_schema (coarse)" : "prisma migrate diff"}`,
    detail,
  });
}

async function checkAdmin() {
  if (!dbReachable) {
    record({ id: "admin-account", title: "At least one ADMIN account exists", status: "skip", summary: "skipped — the database is not reachable" });
    return;
  }
  try {
    const admins = await db.user.count({ where: { role: "ADMIN" } });
    const users = await db.user.count();
    if (admins > 0) {
      record({
        id: "admin-account",
        title: "At least one ADMIN account exists",
        status: "pass",
        summary: `${admins} admin account(s) of ${users} user(s)`,
      });
      return;
    }
    record({
      id: "admin-account",
      title: "At least one ADMIN account exists",
      status: "fail",
      summary: `no account has role = ADMIN (${users} user(s) total)`,
      remedy:
        "node scripts/promote-admin.mjs <email>   — run it against THIS database (DATABASE_URL differs per environment).\n" +
        "    Two things depend on it, both post-deploy: step 3 of the runbook verifies the release through /admin/health, /admin/flags, /admin/audit and /admin/sites, and the documented way to disable a bad feature WITHOUT a rollback is flipping a row on /admin/flags. With no admin, the entire section is unreachable by everyone and neither is available.",
    });
  } catch (err) {
    record({
      id: "admin-account",
      title: "At least one ADMIN account exists",
      status: "fail",
      summary: "could not count admin accounts",
      detail: [sanitize(String(err?.message ?? err)).split(/\r?\n/)[0]],
      remedy: "Usually a symptom of the drift above rather than a problem of its own.",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Environment variables — names only, never values
// ═══════════════════════════════════════════════════════════════════════════
//
// Two lists, because "required" and "the feature is silently inert" are
// different problems with different answers. The second one is the shape the
// runbook flags as most likely to be missed: nothing throws, nothing logs, the
// feature simply never happens.

/** Hard requirements: the app or the build is broken without these. */
const REQUIRED = [
  { name: "DATABASE_URL", why: "every request that touches data" },
];

/** Feature-gated. Missing = that feature is off, loudly listed here. */
const FEATURES = [
  {
    names: ["KODELY_REWARDS_ID_SALT"],
    feature: "Social / Discord rewards",
    effect: "identitySecret() returns null and grantReward is never reached — NO reward is ever granted, and the UI reports \"unavailable\". Also inert if the value is shorter than 16 characters, which this check cannot see.",
    min: 16,
  },
  {
    names: ["KODELY_CRON_SECRET"],
    feature: "Transactional notifications",
    effect: "POST /api/notifications/run fails closed with a 404. The cron fires, nothing sends, nothing complains. Same effect if the value is under 16 characters.",
    min: 16,
  },
  {
    names: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    feature: "Billing / top-ups",
    effect: "billingEnabled() is false; checkout returns 503.",
    all: true,
  },
  {
    names: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
    feature: "Outbound email",
    effect: "isMailConfigured() is false; contact-form mail and every notification are skipped.",
    all: true,
  },
  {
    names: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    feature: "Google sign-in",
    effect: "the Google button cannot complete an OAuth exchange.",
    all: true,
  },
  {
    names: ["KODELY_DISCORD_CLIENT_ID", "KODELY_DISCORD_CLIENT_SECRET", "KODELY_DISCORD_GUILD_ID"],
    feature: "Discord reward",
    effect: "the reward is not offered and a hand-typed URL redirects to ?reward=unavailable.",
    all: true,
  },
  {
    names: ["APP_URL"],
    feature: "Absolute URLs in emails and Stripe redirects",
    effect: "falls back to https://kodely.me — correct on prod, WRONG on staging, where checkout success bounces the user to production.",
  },
  {
    names: ["KODELY_SITES_BASE"],
    feature: "Published-site hostnames",
    effect: "falls back to kodely.site.",
  },
  {
    names: ["KODELY_STAGING_HOST"],
    feature: "Path-form site serving outside prod",
    effect: "falls back to staging.kodely.me.",
  },
  {
    names: ["KODELY_ADMIN_HOST"],
    feature: "Admin host pinning in proxy.ts",
    effect: "unset means no host restriction on /admin.",
  },
  {
    names: ["LOGIN_KEY_SALT"],
    feature: "Login-attempt bucket pseudonymisation",
    effect: "falls back to a constant in the source, so the digest is recomputable by anyone holding the repo. The limiter still works.",
  },
];

// Every env var read anywhere in the app that has a `?? default`. An EMPTY
// string is not undefined, so `??` does NOT substitute the default — the app
// gets "". This is strictly worse than unset and looks identical in a .env.
const DEFAULTED = [
  "KODELY_SITES_BASE", "NEXT_PUBLIC_SITES_BASE", "KODELY_STAGING_HOST", "APP_URL",
  "MAIL_FROM", "CONTACT_TO", "SMTP_PORT", "KODELY_FOUNDATION_DIR", "KODELY_ENGINE",
  "LOGIN_KEY_SALT", "KODELY_MODEL_BUILDER", "KODELY_MODEL_PLANNER", "KODELY_MODEL_ENHANCER",
];

function checkRequiredEnv() {
  const missing = REQUIRED.filter((r) => !isSet(r.name));

  // The generation engine picks its credential at runtime, so which one is
  // required depends on KODELY_ENGINE. lib/agent.ts: `=== "sdk" ? "sdk" : "api"`.
  const engine = process.env.KODELY_ENGINE === "sdk" ? "sdk" : "api";
  const detail = [`generation engine: ${engine} (KODELY_ENGINE${isSet("KODELY_ENGINE") ? "" : " unset → api"})`];

  if (engine === "api") {
    if (!isSet("ANTHROPIC_API_KEY")) {
      missing.push({ name: "ANTHROPIC_API_KEY", why: "the api engine — every generation fails without it" });
    }
  } else {
    const home = process.env.HOME ?? process.env.USERPROFILE;
    const credsFile = home ? join(home, ".claude", ".credentials.json") : null;
    const hasCreds = !!credsFile && existsSync(credsFile);
    if (!isSet("CLAUDE_CODE_OAUTH_TOKEN") && !hasCreds) {
      missing.push({
        name: "CLAUDE_CODE_OAUTH_TOKEN",
        why: "the sdk engine, and no ~/.claude/.credentials.json was found either — assertSdkCredentials() throws on every build",
      });
    } else {
      detail.push(hasCreds && !isSet("CLAUDE_CODE_OAUTH_TOKEN")
        ? "sdk credentials: ~/.claude/.credentials.json (present)"
        : "sdk credentials: CLAUDE_CODE_OAUTH_TOKEN is set");
    }
  }

  if (!missing.length) {
    record({
      id: "env-required",
      title: "Required environment variables are set",
      status: "pass",
      summary: "all present",
      detail,
    });
    return;
  }
  record({
    id: "env-required",
    title: "Required environment variables are set",
    status: "fail",
    summary: `${missing.length} missing: ${missing.map((m) => m.name).join(", ")}`,
    detail: [...detail, ...missing.map((m) => `${m.name} — needed by ${m.why}`)],
    remedy: "Set them on the box (.env* is gitignored, so each environment keeps its own and nothing deploys them). Names only in tickets and chat — never a value.",
  });
}

function checkFeatureEnv() {
  const off = [];
  for (const f of FEATURES) {
    const present = f.names.filter(isSet);
    const absent = f.names.filter((n) => !isSet(n));
    const isOff = f.all ? absent.length > 0 : present.length === 0;
    if (isOff) off.push({ ...f, absent, partial: f.all && present.length > 0 });
  }

  if (!off.length) {
    record({ id: "env-features", title: "Feature environment variables", status: "pass", summary: "every optional feature is configured" });
    return;
  }

  record({
    id: "env-features",
    title: "Feature environment variables",
    status: "warn",
    summary: `${off.length} feature(s) will be inert in this environment`,
    detail: off.map((f) =>
      `${f.feature}${f.partial ? " (PARTIALLY configured — worse than neither)" : ""}\n` +
      `      unset: ${f.absent.join(", ")}\n` +
      `      ${f.effect}`,
    ),
    remedy: "Decide per environment which of these is intentional. Billing off on staging is correct; rewards or notifications off on production is not. Nothing here throws or logs — that is exactly why it needs a checklist.",
  });
}

function checkEmptyEnv() {
  const empties = DEFAULTED.filter(isEmptyString);
  if (!empties.length) {
    record({ id: "env-empty", title: "No env var is set to an empty string", status: "pass", summary: "none" });
    return;
  }
  record({
    id: "env-empty",
    title: "No env var is set to an empty string",
    status: "warn",
    summary: `${empties.length} var(s) are defined but empty: ${empties.join(", ")}`,
    detail: [
      "The app reads these as `process.env.X ?? \"default\"`. `??` only substitutes for undefined and null,",
      "so an empty value is passed straight through and the documented default never applies.",
      "A `NAME=` line in .env is indistinguishable from a correct one at a glance.",
    ],
    remedy: "Either give the variable a real value or delete the line entirely. Deleting it is what restores the default.",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. The foundation tree
// ═══════════════════════════════════════════════════════════════════════════
//
// lib/build-site.ts symlinks FOUNDATION_DIR/node_modules into every throwaway
// build directory and then spawns node against a specific vite entrypoint
// INSIDE it. Both the default path and the entrypoint are read back out of
// lib/build-site.ts rather than hardcoded here, so this check cannot silently
// drift away from the code it is checking.

function foundationExpectations() {
  const src = readFileSync(join(ROOT, "lib", "build-site.ts"), "utf8");
  const def = src.match(/KODELY_FOUNDATION_DIR\s*\?\?\s*"([^"]+)"/);
  const entry = src.match(/join\(\s*"node_modules"\s*,\s*"vite"\s*,\s*"bin"\s*,\s*"vite\.js"\s*\)/);
  return {
    defaultDir: def ? def[1] : null,
    entryRel: entry ? join("node_modules", "vite", "bin", "vite.js") : null,
  };
}

function checkFoundation() {
  let exp;
  try {
    exp = foundationExpectations();
  } catch (err) {
    record({
      id: "foundation", title: "Foundation tree is usable", status: "fail",
      summary: "could not read lib/build-site.ts", detail: [String(err?.message ?? err)],
    });
    return;
  }

  const detail = [];
  if (!exp.defaultDir || !exp.entryRel) {
    detail.push("NOTE: lib/build-site.ts no longer matches the shape this check parses — the expectations below may be out of date.");
  }
  const entryRel = exp.entryRel ?? join("node_modules", "vite", "bin", "vite.js");
  const fallback = exp.defaultDir ?? "/home/kodely/kodely-foundation";

  const explicit = isSet("KODELY_FOUNDATION_DIR");
  const dir = explicit ? process.env.KODELY_FOUNDATION_DIR : fallback;
  detail.push(explicit
    ? "KODELY_FOUNDATION_DIR is set (path resolved below)"
    : `KODELY_FOUNDATION_DIR unset → falling back to ${fallback}`);
  detail.push(`resolved: ${dir}`);

  const problems = [];
  if (!existsSync(dir)) {
    problems.push("the directory does not exist");
  } else {
    if (!existsSync(join(dir, "node_modules"))) problems.push("no node_modules — scripts/install-foundation.mjs has not been run here");
    if (!existsSync(join(dir, entryRel))) problems.push(`missing the entrypoint lib/build-site.ts spawns: ${entryRel}`);
  }

  if (!problems.length) {
    record({
      id: "foundation", title: "Foundation tree is usable", status: "pass",
      summary: `node_modules and ${entryRel} both present`, detail,
    });
    return;
  }

  record({
    id: "foundation", title: "Foundation tree is usable", status: "fail",
    summary: problems.join("; "),
    detail,
    remedy:
      (explicit
        ? "Fix the path, or run: node scripts/install-foundation.mjs"
        : `Set KODELY_FOUNDATION_DIR for this machine and run: node scripts/install-foundation.mjs. The unset fallback is a Linux path (${fallback}); on any other box it resolves to nothing and every generation fails with a "Cannot find module" that names vite, not the missing foundation — which is why this failure is always misdiagnosed.`),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Build freshness
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_DIRS = ["app", "lib", "components", "content", "prisma", "public"];
const SOURCE_FILES = ["next.config.ts", "package.json", "package-lock.json", "postcss.config.mjs", "tsconfig.json", "proxy.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".verify"]);

function newestSource() {
  let newest = { path: null, mtime: 0 };
  const consider = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.mtimeMs > newest.mtime) newest = { path: p, mtime: st.mtimeMs };
  };
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else consider(p);
    }
  };
  for (const d of SOURCE_DIRS) walk(join(ROOT, d));
  for (const f of SOURCE_FILES) consider(join(ROOT, f));
  return newest;
}

function checkBuild() {
  const buildId = join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    record({
      id: "build-freshness", title: "Local .next is present and current", status: "warn",
      summary: ".next/BUILD_ID does not exist — nothing has been built here",
      remedy: "Not a deploy blocker: deploy.sh runs `npm ci && npm run build` on the VM, so what ships is built there. It matters only if you intend to verify locally, or if this checkout IS the box being served.",
    });
    return;
  }

  const built = statSync(buildId).mtimeMs;
  const src = newestSource();
  const iso = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  const detail = [
    `.next/BUILD_ID   ${iso(built)}`,
    `newest source    ${iso(src.mtime)}  ${src.path ? src.path.slice(ROOT.length + 1) : "?"}`,
  ];

  if (src.mtime <= built) {
    record({ id: "build-freshness", title: "Local .next is present and current", status: "pass", summary: "build is newer than every source file", detail });
    return;
  }

  const mins = Math.round((src.mtime - built) / 60000);
  record({
    id: "build-freshness", title: "Local .next is present and current", status: "warn",
    summary: `.next is ${mins} minute(s) behind the newest source file`,
    detail,
    remedy: "Warning, not a blocker, and the distinction matters: deploy.sh builds on the VM from the commits it transports, so a stale local .next cannot ship. It only misleads YOU — anything you check against a local `next start` right now is the old build.",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. /api/health is shallow
// ═══════════════════════════════════════════════════════════════════════════

function checkHealthEndpoint() {
  const p = join(ROOT, "app", "api", "health", "route.ts");
  if (!existsSync(p)) {
    record({ id: "health-shallow", title: "Deploy verification depth", status: "warn", summary: "app/api/health/route.ts not found — deploy.sh curls /api/health and will get a 404" });
    return;
  }
  const src = readFileSync(p, "utf8");
  const touchesDb = /\bfrom\s+["']@\/lib\/db["']|\bdb\.|\$queryRaw/.test(src);

  if (touchesDb) {
    record({ id: "health-shallow", title: "Deploy verification depth", status: "pass", summary: "/api/health touches the database — deploy.sh's verification is meaningful" });
    return;
  }

  record({
    id: "health-shallow",
    title: "Deploy verification depth",
    status: "warn",
    summary: "/api/health touches no dependency — deploy.sh can report a healthy deploy during a total database outage",
    detail: [
      "deploy.sh verifies /api/health, /, /pricing, /blog and /contact. The first returns a static",
      "JSON literal; the other four are static marketing pages. All five return 200 with the database",
      "down, the foundation missing and every generation failing.",
    ],
    remedy: "Nothing to fix before this deploy — just do not read a green deploy.sh as \"the release works\". Its real job is catching a stale commit and a service that did not come back. Step 3 of the runbook (/admin/health, one real generation, one sign-in) is the actual verification, and the db-reachable and schema-drift checks above are this tool's substitute for the part deploy.sh cannot see.",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Content coupling — the export route and the live blog copy
// ═══════════════════════════════════════════════════════════════════════════

function checkContentCoupling() {
  const exportRoute = join(ROOT, "app", "api", "projects", "[id]", "export", "route.ts");
  const corrector = join(ROOT, "scripts", "seo", "correct-live.mjs");
  const gateFile = join(ROOT, "content", "seo", "corrections", "export-claim.json");

  if (!existsSync(exportRoute)) {
    record({
      id: "content-coupling", title: "Blog claims match what is shipping", status: "pass",
      summary: "no project export route in this tree — the live \"no zip download\" copy stays true",
    });
    return;
  }

  const missing = [];
  if (!existsSync(corrector)) missing.push("scripts/seo/correct-live.mjs is missing");
  if (!existsSync(gateFile)) missing.push("content/seo/corrections/export-claim.json is missing");

  record({
    id: "content-coupling",
    title: "Blog claims match what is shipping",
    status: "warn",
    summary: "the export route is in this tree — the gated blog corrections must run in the SAME window",
    detail: [
      "app/api/projects/[id]/export/route.ts exists, so this deploy makes the project zip download real.",
      "Live BlogPost rows currently state there is no zip or full-project download. True today, false the",
      "moment this ships, and those rows live only on the production database — this repo has no copy of 42",
      "of them, so nothing in a build or a test will notice.",
      ...(missing.length ? missing.map((m) => `PROBLEM: ${m}`) : []),
    ],
    remedy:
      "Immediately after step 5 verifies — not the next morning:\n" +
      "      on the VM, in /opt/kodely\n" +
      "      node scripts/seo/correct-live.mjs --gate export-shipped            (dry run, the default)\n" +
      "      node scripts/seo/correct-live.mjs --gate export-shipped --apply\n" +
      "    Passing the gate is you asserting the route is live — download a .zip from a real project on production first. " +
      "The script sweeps every row afterwards and exits non-zero on residue; a non-zero exit means it is NOT finished. " +
      "Running it BEFORE the deploy is the other wrong answer: 30+ live pages would claim a feature that is not there yet.",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// run
// ═══════════════════════════════════════════════════════════════════════════

try {
  checkBranch();
  checkClean();
  checkRemote();
  await connectDb();
  await checkSchemaDrift();
  await checkAdmin();
  checkRequiredEnv();
  checkFeatureEnv();
  checkEmptyEnv();
  checkFoundation();
  checkBuild();
  checkHealthEndpoint();
  checkContentCoupling();
} catch (err) {
  process.stdout.write(`preflight failed to run: ${sanitize(String(err?.stack ?? err))}\n`);
  process.exitCode = 3;
} finally {
  if (db) await db.$disconnect().catch(() => {});
}

if (process.exitCode === 3) process.exit(3);

// ── severity ───────────────────────────────────────────────────────────────
// A check's SEVERITY is a property of the check, not of its outcome: a failing
// blocker-class check is a BLOCKER, a failing warning-class check is a WARNING.
const SEVERITY = {
  "git-branch": "BLOCKER",
  "git-clean": "BLOCKER",
  "git-remote": "BLOCKER",       // downgraded to WARNING when it only warns
  "db-reachable": "BLOCKER",
  "schema-drift": "BLOCKER",
  "admin-account": "BLOCKER",
  "env-required": "BLOCKER",
  "foundation": "BLOCKER",
  "env-features": "WARNING",
  "env-empty": "WARNING",
  "build-freshness": "WARNING",
  "health-shallow": "WARNING",
  "content-coupling": "WARNING",
};

for (const ck of checks) ck.severity = ck.status === "warn" ? "WARNING" : SEVERITY[ck.id] ?? "WARNING";

const blockers = checks.filter((ck) => ck.status === "fail");
const warnings = checks.filter((ck) => ck.status === "warn");
const passed = checks.filter((ck) => ck.status === "pass");
const skipped = checks.filter((ck) => ck.status === "skip");

const exitCode = blockers.length ? 1 : warnings.length && STRICT ? 2 : 0;

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        tool: "kodely-preflight",
        version: 1,
        generatedAt: new Date().toISOString(),
        repo: ROOT,
        head: { sha: headSha, short: headShort, branch },
        ok: blockers.length === 0,
        exitCode,
        counts: {
          blocker: blockers.length,
          warning: warnings.length,
          pass: passed.length,
          skip: skipped.length,
        },
        checks: checks.map((ck) => ({
          id: ck.id,
          title: ck.title,
          status: ck.status,
          severity: ck.severity,
          summary: ck.summary,
          // Strip any ANSI that leaked in from dim() so JSON stays clean.
          detail: ck.detail.map((d) => String(d).replace(/\u001b\[\d+m/g, "")),
          remedy: ck.remedy ? ck.remedy.replace(/\u001b\[\d+m/g, "") : null,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(exitCode);
}

// ── human output ───────────────────────────────────────────────────────────

const out = [];
out.push("");
out.push(bold("Kodely deploy preflight") + dim(`  ${new Date().toISOString().replace("T", " ").slice(0, 19)}Z`));
out.push(dim(`  repo  ${ROOT}`));
out.push(dim(`  HEAD  ${headShort}  on ${branch}`));
out.push(dim("  read-only: nothing below wrote, migrated or deployed anything"));

function section(title, list, paint, mark) {
  if (!list.length) return;
  out.push("");
  out.push(paint(bold(title)));
  for (const ck of list) {
    out.push(`  ${paint(mark)} ${bold(ck.title)} — ${ck.summary}`);
    for (const d of ck.detail) {
      for (const line of String(d).split("\n")) out.push(`      ${dim(line)}`);
    }
    if (ck.remedy) {
      const [first, ...rest] = ck.remedy.split("\n");
      out.push(`      ${paint("→")} ${first}`);
      for (const line of rest) out.push(`      ${line}`);
    }
  }
}

section(`BLOCKERS (${blockers.length})`, blockers, red, "X");
section(`WARNINGS (${warnings.length})`, warnings, yellow, "!");

if (passed.length) {
  out.push("");
  out.push(green(bold(`PASSED (${passed.length})`)));
  for (const ck of passed) out.push(`  ${green("ok")} ${ck.title} — ${dim(ck.summary)}`);
}
if (skipped.length) {
  out.push("");
  out.push(dim(bold(`NOT CHECKED (${skipped.length})`)));
  for (const ck of skipped) out.push(`  ${dim("--")} ${ck.title} — ${dim(ck.summary)}`);
}

out.push("");
out.push(
  blockers.length
    ? red(bold(`DO NOT DEPLOY — ${blockers.length} blocker(s), ${warnings.length} warning(s).`))
    : warnings.length
      ? yellow(bold(`No blockers. ${warnings.length} warning(s) — read them, then deploy.`))
      : green(bold("All clear.")),
);
out.push(dim("  Ordering is not checked by anything: schema first, then code, per docs/ops/runbook-deploy.md."));
if (warnings.length && !STRICT) out.push(dim("  Warnings do not affect the exit code unless you pass --strict."));
out.push("");

process.stdout.write(out.join("\n") + "\n");
process.exit(exitCode);

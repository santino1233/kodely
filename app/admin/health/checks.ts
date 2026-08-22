import { access } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { ENGINE } from "@/lib/agent";
import { isMailConfigured } from "@/lib/mail";
import { billingEnabled } from "@/lib/stripe";

// Dependency checks for /admin/health.
//
// SECRETS RULE, enforced by construction: every field below is a boolean, a
// duration, or a hand-written sentence. The only place an environment
// variable appears is in `env`, which holds NAMES. Nothing here ever reads a
// value into a string that reaches the page — not truncated, not masked. A
// masked secret is still a secret leak with extra steps, and an admin panel
// that prints "sk-ant-…f3a2" has put a fingerprint of the key in every
// screenshot of it.
//
// app/api/health/route.ts stays the LIVENESS probe: it answers "is the
// process up" with no dependencies, which is what a load balancer needs and
// what makes it safe to be unauthenticated. This module is the readiness
// view — it deliberately touches the things that probe must not.

export type CheckStatus = "ok" | "fail" | "warn" | "unknown";

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** Names and booleans only — never a secret value. */
  detail: string;
  /** Environment variable NAMES this check reads. Values are never rendered. */
  env: string[];
};

/**
 * Mirrors lib/build-site.ts, which does not export it. If that default ever
 * changes, this line has to change with it — and the mismatch would show up
 * here as a check that disagrees with reality, which is the failure mode this
 * page exists to make visible.
 */
const FOUNDATION_DIR = process.env.KODELY_FOUNDATION_DIR ?? "/home/kodely/kodely-foundation";
const FOUNDATION_DIR_SET = Boolean(process.env.KODELY_FOUNDATION_DIR);

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export type DatabaseCheck = Check & { latencyMs: number | null };

/**
 * The one check that has to work when nothing else does. Every other panel on
 * the page is a query against this connection, so the page runs this first
 * and degrades to checks-only if it fails, rather than throwing a 500 at the
 * exact moment an operator is trying to find out what is wrong.
 */
export async function checkDatabase(): Promise<DatabaseCheck> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    return {
      id: "database",
      label: "Database reachable",
      status: latencyMs > 1000 ? "warn" : "ok",
      detail:
        latencyMs > 1000
          ? `SELECT 1 answered in ${latencyMs}ms — slow enough to be worth looking at.`
          : `SELECT 1 answered in ${latencyMs}ms.`,
      env: ["DATABASE_URL"],
      latencyMs,
    };
  } catch {
    return {
      id: "database",
      label: "Database reachable",
      status: "fail",
      // The driver's message can carry the connection string, so it is
      // deliberately swallowed rather than surfaced.
      detail:
        "SELECT 1 failed. The error is withheld here because a Postgres connection error can echo the DSN — read it from the server log.",
      env: ["DATABASE_URL"],
      latencyMs: null,
    };
  }
}

/**
 * The foundation tree is the shared, pre-installed node_modules every build
 * symlinks against instead of running `npm install` per generation. When it is
 * absent, vite fails with "Cannot find module", which reads like a bug in the
 * generated site and is not — this has cost debugging time twice.
 *
 * Three separate checks rather than one, because "the directory is there" is
 * not the question: the question is whether the exact entrypoint
 * lib/build-site.ts spawns is on disk.
 */
export async function checkFoundation(): Promise<Check[]> {
  const dirOk = await exists(FOUNDATION_DIR);
  const modulesOk = dirOk && (await exists(path.join(FOUNDATION_DIR, "node_modules")));
  const viteOk =
    modulesOk &&
    (await exists(path.join(FOUNDATION_DIR, "node_modules", "vite", "bin", "vite.js")));

  return [
    {
      id: "foundation-dir",
      label: "Foundation directory",
      status: dirOk ? "ok" : "fail",
      detail: dirOk
        ? FOUNDATION_DIR_SET
          ? "Present. KODELY_FOUNDATION_DIR is set and the path it names exists."
          : "Present, but KODELY_FOUNDATION_DIR is unset — this is the built-in Linux default path, which is wrong on a Windows host."
        : FOUNDATION_DIR_SET
          ? "Missing. KODELY_FOUNDATION_DIR is set but names a path that does not exist."
          : "Missing, and KODELY_FOUNDATION_DIR is unset, so lib/build-site.ts fell back to its Linux default path. On Windows that resolves under the drive root and every build fails at the symlink step.",
      env: ["KODELY_FOUNDATION_DIR"],
    },
    {
      id: "foundation-modules",
      label: "Foundation node_modules",
      status: modulesOk ? "ok" : "fail",
      detail: modulesOk
        ? "Present. Builds symlink this tree instead of installing per generation."
        : "Missing. Every build will fail with a misleading “Cannot find module”. Re-run scripts/install-foundation.mjs on this host.",
      env: ["KODELY_FOUNDATION_DIR"],
    },
    {
      id: "foundation-vite",
      label: "Vite entrypoint",
      status: viteOk ? "ok" : "fail",
      detail: viteOk
        ? "node_modules/vite/bin/vite.js is on disk — the exact file lib/build-site.ts spawns."
        : "node_modules/vite/bin/vite.js is absent. A node_modules directory that exists but is incomplete fails the same way as no directory at all.",
      env: [],
    },
  ];
}

export type EngineCheck = {
  engine: "api" | "sdk";
  /** True when recorded costMicros are imputed from a rate card rather than billed. */
  costsImputed: boolean;
  credentials: Check;
};

/**
 * Which generation engine is live, and whether it can authenticate.
 *
 * The credential check re-derives assertSdkCredentials() from lib/agent-sdk.ts
 * (which is private to that module) rather than importing it: importing
 * lib/agent-sdk.ts for its side effects would delete ANTHROPIC_API_KEY from
 * this process, which is a mutation an admin page has no business performing.
 */
export async function checkEngine(): Promise<EngineCheck> {
  if (ENGINE === "sdk") {
    const home = process.env.HOME ?? process.env.USERPROFILE;
    const hasToken = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
    const hasCredentialsFile =
      Boolean(home) && (await exists(path.join(home as string, ".claude", ".credentials.json")));
    const ok = hasToken || hasCredentialsFile;

    return {
      engine: "sdk",
      costsImputed: true,
      credentials: {
        id: "engine-credentials",
        label: "SDK subscription credentials",
        status: ok ? "ok" : "fail",
        detail: ok
          ? hasToken
            ? "CLAUDE_CODE_OAUTH_TOKEN is set. Presence only — an expired or revoked token reads as OK here and shows up above as an SDK-auth failure family."
            : "A ~/.claude/.credentials.json written by `claude setup-token` is present for the user running this process. Presence only — a stale login reads as OK here and shows up above as an SDK-auth failure family."
          : "Neither CLAUDE_CODE_OAUTH_TOKEN nor ~/.claude/.credentials.json is present, so every generation will fail with “Not logged in” before reaching the model. There is deliberately no fallback to the metered API engine.",
        env: ["CLAUDE_CODE_OAUTH_TOKEN"],
      },
    };
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    engine: "api",
    costsImputed: false,
    credentials: {
      id: "engine-credentials",
      label: "Anthropic API key",
      status: hasKey ? "ok" : "fail",
      detail: hasKey
        ? "ANTHROPIC_API_KEY is set. Presence only — nothing here validates it against the API."
        : "ANTHROPIC_API_KEY is unset. The metered engine cannot start a generation.",
      env: ["ANTHROPIC_API_KEY"],
    },
  };
}

/** SMTP and Stripe both follow the "inert until configured" shape, so absent is a state, not an error. */
export function checkIntegrations(): Check[] {
  const mail = isMailConfigured();
  const stripe = billingEnabled();

  return [
    {
      id: "smtp",
      label: "SMTP configured",
      status: mail ? "ok" : "warn",
      detail: mail
        ? "Host, user and password are all set. Presence only — no connection is attempted from this page."
        : "Not configured. lib/mail.ts stays inert and callers return a clean 503, so transactional mail (welcome, low credits, build failed) silently does not send.",
      env: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"],
    },
    {
      id: "stripe",
      label: "Stripe configured",
      status: stripe ? "ok" : "warn",
      detail: stripe
        ? "Secret key and webhook secret are both set. Presence only — no call is made to Stripe."
        : "Not configured. Billing degrades gracefully and nobody can top up credits.",
      env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
  ];
}

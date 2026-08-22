import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Runtime feature flags and kill switches, backed by the `FeatureFlag` table.
//
// The point of this module is that a behaviour change does NOT require a
// deploy. `deploy.sh` on this project has a history of shipping stale code,
// and a kill switch that needs a deploy is not a kill switch — it is a
// postmortem action item. Flipping a row here takes effect everywhere within
// one cache TTL (see FLAG_CACHE_TTL_MS below), with no build, no restart and
// no risk of shipping whatever else happened to be sitting on main.
//
// Three rules keep it honest, and they are the same three that keep
// lib/events.ts useful:
//
// 1. KEYS ARE A CLOSED SET. FLAGS below is the whole vocabulary. Free-text
//    flag keys rot exactly like free-text event names: someone checks
//    "publish_enabled" while the admin page writes "publishing.enabled", the
//    check silently reads a missing row forever, and the kill switch that
//    everyone believes exists does nothing on the day it matters.
// 2. EVERY FLAG READS AS A CAPABILITY THAT IS ON. `generation.enabled` is
//    true when generation works. There is no flag whose `enabled = true` means
//    "the thing is broken/off" — inverted flags are how someone turns
//    generation OFF at 3am while trying to turn it off.
// 3. BEHAVIOUR WHEN THE DATABASE IS NOT THERE IS DECLARED PER FLAG, in code,
//    next to the flag. See `whenUnavailable`.

export const FLAGS = {
  // ── Kill switches ────────────────────────────────────────────────────────
  // Each one guards a flow that costs us money, publishes something to the
  // public internet, or moves credits. Steady state is ON; turning one off is
  // an incident action.

  /** Model generation (POST /api/generate). The big red button — it is the only spend that scales with traffic. */
  generation: "generation.enabled",
  /** Publishing a project to a *.kodely.site subdomain. Off = no new public pages while a moderation or abuse incident is worked. */
  publishing: "publishing.enabled",
  /** New account creation, password and Google alike. Off = stop the bleeding during a signup-abuse wave; existing users are unaffected. */
  signups: "signups.enabled",
  /** Social/Discord reward grants. Off = stop granting credits while a farming pattern is investigated. This one moves money. */
  rewards: "rewards.enabled",

  // ── Feature gates ────────────────────────────────────────────────────────
  // These exist to roll something out, not to survive an incident. They are
  // the flags where `rolloutPct` earns its keep.

  /** The Enhance button that expands a rough prompt into a spec (POST /api/enhance). Fully shipped; the flag exists to shed its cost if it ever misbehaves. */
  promptEnhance: "feature.prompt_enhance",
  /** Route a percentage of builds through the Claude Agent SDK engine (lib/agent-sdk.ts) instead of the direct-API engine. Off = everyone stays on the proven path. */
  sdkEngine: "feature.sdk_engine",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

export type FlagKind = "kill" | "gate";

export type FlagSpec = {
  kind: FlagKind;
  /** Shown in the admin UI and written into the row on every save. */
  description: string;
  /**
   * The answer when NO ROW EXISTS for this key. A missing row means "nobody
   * has ever had an opinion about this in production", so code is the source
   * of truth and this is the intended steady state. It is deliberately NOT the
   * same axis as `whenUnavailable`: a fresh database is a normal state, an
   * unreachable database is not, and conflating them means a brand new
   * environment boots with every kill switch engaged.
   */
  whenUnset: boolean;
  /**
   * The answer when the database CANNOT BE READ and this process has never
   * successfully cached a value. Note the second half: a process that has read
   * the table even once keeps serving its last-known-good snapshot through an
   * outage (see `snapshot()`), so this only fires on a cold process talking to
   * a broken database. See `reason` for why each flag points where it does.
   */
  whenUnavailable: boolean;
  /** Why `whenUnavailable` points where it does. Surfaced in the admin UI. */
  reason: string;
};

// ── Fail-open vs fail-closed ─────────────────────────────────────────────
//
// There is no single right answer, which is exactly why it is declared per
// flag rather than picked once in `isEnabled`.
//
// KILL SWITCHES FAIL CLOSED (whenUnavailable: false). The entire value of a
// kill switch is that "off" is *enforceable*. If it failed open, then the one
// scenario where you most want it — something is on fire, and the database is
// part of what is on fire — is the scenario where it silently stops working.
// The usual objection to failing closed is that a transient blip takes the
// product down. That objection does not apply here, and it is worth being
// precise about why: all four of these flows are already 100% dependent on
// this same Postgres. Generation reads the project and its message history,
// publishing writes the published file tree, signup inserts a user, a reward
// writes a ledger row. If this query cannot run, none of those requests could
// have succeeded anyway. Failing closed costs a clearer error message, not a
// working feature.
//
// FEATURE GATES DO NOT ALL POINT THE SAME WAY, and that is the real lesson:
// the direction follows what "false" actually does to a user, not what
// category the flag is filed under.
//   - `feature.prompt_enhance` fails OPEN. It is shipped at 100%. "False"
//     means the Enhance button vanishes for every user because of a blip in a
//     table that has nothing to do with Enhance — a self-inflicted outage of a
//     working feature, strictly worse than the blip itself.
//   - `feature.sdk_engine` fails CLOSED. "False" here does not remove a
//     feature; it routes the build down the older, more heavily exercised
//     engine. Closed IS the known-good path, so ambiguity should resolve to it.

export const FLAG_SPECS: Record<FlagKey, FlagSpec> = {
  [FLAGS.generation]: {
    kind: "kill",
    description: "Model generation. Off: /api/generate refuses new builds.",
    whenUnset: true,
    whenUnavailable: false,
    reason:
      "Fail closed. A build cannot run without this database anyway (it reads the project and message history), so denying loudly costs nothing and keeps the switch enforceable during exactly the incident it exists for.",
  },
  [FLAGS.publishing]: {
    kind: "kill",
    description: "Publishing to *.kodely.site. Off: no new or updated public sites.",
    whenUnset: true,
    whenUnavailable: false,
    reason:
      "Fail closed. Publishing writes the published file tree to this database; if it is unreachable the publish would fail regardless. Erring toward 'no new public page' is the right direction for a flow whose incident mode is abusive content.",
  },
  [FLAGS.signups]: {
    kind: "kill",
    description: "New account creation (password and Google). Off: existing users unaffected.",
    whenUnset: true,
    whenUnavailable: false,
    reason:
      "Fail closed. Signup inserts a user row, grants credits and seeds a project — all in this database. It cannot succeed while the database is down, and a signup-abuse wave is precisely when you cannot afford the switch to be advisory.",
  },
  [FLAGS.rewards]: {
    kind: "kill",
    description: "Social and Discord reward grants. Off: no reward credits are issued.",
    whenUnset: true,
    whenUnavailable: false,
    reason:
      "Fail closed, and the strongest case of the four: this flow writes credit ledger rows. Not granting a reward is recoverable by hand; granting one during a farming incident because the flag could not be read is not.",
  },
  [FLAGS.promptEnhance]: {
    kind: "gate",
    description: "The Enhance button that expands a rough prompt into a spec.",
    whenUnset: true,
    whenUnavailable: true,
    reason:
      "Fail OPEN. This is shipped to everyone, so 'false' would yank a working feature from 100% of users over a blip in an unrelated table — a self-inflicted outage worse than the blip. Enhance is also credit-free by design, so an extra minute of it costs cents, not a bill.",
  },
  [FLAGS.sdkEngine]: {
    kind: "gate",
    description: "Route a share of builds through the Agent SDK engine instead of the direct API.",
    whenUnset: false,
    whenUnavailable: false,
    reason:
      "Fail closed, but 'closed' here is not 'feature off' — it is the older, far more heavily exercised direct-API engine. When the answer is unknown, take the known-good path.",
  },
};

/** Declaration order of FLAGS — the order the admin page lists them in. */
export const FLAG_KEYS: FlagKey[] = Object.values(FLAGS);

export function isFlagKey(value: unknown): value is FlagKey {
  // hasOwnProperty, NOT `in`. The `in` operator walks the prototype chain, so
  // "constructor", "toString" and friends passed a guard whose entire job is
  // to say "this is one of ours". That matters more here than anywhere else it
  // appeared: this guard is the only thing stopping setFlag — a Server Action,
  // i.e. a publicly reachable endpoint — from writing a junk key, and
  // FLAG_SPECS.constructor is a function, so spec.whenUnset is undefined.
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FLAG_SPECS, value);
}

// ── Caching ──────────────────────────────────────────────────────────────
//
// A database round trip per flag check per request is not acceptable —
// /api/generate alone would want three of them before it does any work. A
// stale cache is not acceptable either, because a kill switch is only as good
// as the delay between the click and the effect.
//
// 10 seconds is the compromise, and the number is chosen from both ends:
//
//   Freshness. An incident responder clicks "Turn off", waits out one TTL and
//   the whole fleet has converged. Ten seconds is shorter than the time it
//   takes to alt-tab to the dashboard and confirm the graph moved, so the
//   switch feels immediate rather than broken. A minute does not: at a minute
//   people click it twice, then start looking for a deploy button, which is
//   the exact failure mode this module exists to remove.
//
//   Cost. The refresh reads the WHOLE TABLE in one query, not one query per
//   key, so the cost is 1 query / 10s / process regardless of how many flags
//   exist or how many are checked per request. That is ~0.1 qps per process —
//   noise next to any real request. Dropping to 1s would buy nine seconds of
//   freshness nobody can act on, for 10x the queries.
//
// The cache is PER PROCESS and deliberately not shared. There is no Redis
// here, and adding one to hold six booleans would be its own outage surface.
// The consequence is worth stating plainly: a multi-process or multi-instance
// deploy does not flip atomically, it CONVERGES within one TTL. Every process
// independently notices within 10s. `invalidateFlagCache()` shortcuts this,
// but only for the process that ran the write — which in practice is the one
// serving the admin page, so the admin sees their own change immediately and
// everyone else sees it within the TTL.
export const FLAG_CACHE_TTL_MS = 10_000;

/**
 * After a failed read, wait this long before hammering a database that is
 * already unhappy. Short enough that recovery is fast, long enough that a hot
 * path does not turn one outage into a connection storm.
 */
const ERROR_BACKOFF_MS = 2_000;

type FlagState = { enabled: boolean; rolloutPct: number };

let cache: { rows: Map<string, FlagState>; loadedAt: number } | null = null;
let nextAttemptAt = 0;
let inFlight: Promise<Map<string, FlagState> | null> | null = null;
/**
 * Bumped by every `invalidateFlagCache()`. A read carries the epoch it started
 * under and refuses to publish its result if that epoch is stale — see the note
 * in `refresh()`. Without this, invalidation is not actually a guarantee.
 */
let epoch = 0;

async function refresh(): Promise<Map<string, FlagState> | null> {
  const startedAt = epoch;
  try {
    const rows = await db.featureFlag.findMany({
      select: { key: true, enabled: true, rolloutPct: true },
    });
    const map = new Map<string, FlagState>(
      rows.map((r) => [r.key, { enabled: r.enabled, rolloutPct: r.rolloutPct }]),
    );
    // If the cache was invalidated while this query was in flight, the query
    // began before the write that invalidated it and therefore cannot have seen
    // it. Caching this result would resurrect the pre-write value for a full
    // TTL — in the very process that performed the write, which is the one
    // process this module promises will see its own change immediately. The
    // callers already awaiting this promise still get the rows (their read
    // genuinely predates the write); the next caller starts a fresh query.
    if (startedAt === epoch) {
      cache = { rows: map, loadedAt: Date.now() };
      nextAttemptAt = 0;
    }
    return map;
  } catch (err) {
    console.error("[flags] failed to read FeatureFlag; serving last known values", err);
    if (startedAt === epoch) nextAttemptAt = Date.now() + ERROR_BACKOFF_MS;
    // Stale-if-error. A snapshot from an hour ago still carries the operator's
    // last intent, which is a far better answer than the hardcoded default —
    // and it is what makes failing closed on kill switches cheap: a switch you
    // turned off stays off through the outage instead of springing back open.
    return cache?.rows ?? null;
  } finally {
    // Only if it is still ours: an invalidation already cleared the slot and a
    // newer read may have claimed it.
    if (startedAt === epoch) inFlight = null;
  }
}

/** Null only when the table has never been read successfully by this process. */
async function snapshot(): Promise<Map<string, FlagState> | null> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < FLAG_CACHE_TTL_MS) return cache.rows;
  if (now < nextAttemptAt) return cache?.rows ?? null;
  // Single-flight: on a busy process the TTL expires for many concurrent
  // requests at once, and they must share one query rather than each opening
  // their own.
  inFlight ??= refresh();
  return inFlight;
}

/**
 * Drop this process's cached snapshot. Other processes converge within
 * FLAG_CACHE_TTL_MS.
 *
 * Called after every write, so it must also disown any read that is currently
 * in flight — that read was issued before the write committed, so joining it
 * (or letting it populate the cache when it lands) would serve the pre-write
 * value. Bumping the epoch does both.
 */
export function invalidateFlagCache(): void {
  cache = null;
  nextAttemptAt = 0;
  inFlight = null;
  epoch++;
}

// ── Rollout bucketing ────────────────────────────────────────────────────
//
// `rolloutPct` needs a bucket per subject, and the two obvious cheap options
// are both wrong:
//
//   Math.random() < pct  — the same user gets a different answer on every
//   request. A 50% rollout of a UI feature makes it flicker between page
//   loads, a 50% rollout of an engine splits ONE user's builds across both
//   engines, and any comparison between the two arms is contaminated because
//   nobody is durably in either.
//
//   A cheap function of the id alone (id.charCodeAt, id.length % 100) — cuids
//   share a timestamp-derived prefix, so ids created near each other land in
//   the same bucket and 10% selects a contiguous block of one afternoon's
//   signups rather than a random tenth of the user base.
//
// So: sha256 over `${subjectId}:${key}`, first 4 bytes as a uint32, mod 100.
//
//   Hashing the SUBJECT makes the answer stable — same user, same flag, same
//   answer on every request, in every process, across restarts and deploys,
//   with no state stored anywhere.
//
//   Mixing in the KEY decorrelates flags. Hash the user id alone and every
//   flag set to 50% picks the *same* half of the user base: the unluckiest
//   users get every experiment at once, and two independent 50% rollouts are
//   silently a single cohort. With the key mixed in, each flag gets its own
//   independent shuffle.
//
//   sha256 comes from node:crypto (no dependency) and avalanches properly, so
//   the buckets are uniform. It costs roughly a microsecond on a ~40 byte
//   input — irrelevant, since it replaces a database round trip, not a
//   comparison. Modulo bias over a uint32 into 100 buckets is on the order of
//   1e-8 and does not matter at any user count this product will ever see.
export function rolloutBucket(subjectId: string, key: string): number {
  return createHash("sha256").update(`${subjectId}:${key}`).digest().readUInt32BE(0) % 100;
}

/**
 * Is this flag on, for this subject, right now?
 *
 * `userId` is the bucketing subject for partial rollouts. Any stable
 * identifier works (a user id is the right one; a project owner's id would
 * do), but it must be stable for that subject or the rollout stops being a
 * rollout — see `rolloutBucket`.
 *
 * Resolution order, and why each step is where it is:
 *   1. Database unreadable and nothing ever cached → the flag's declared
 *      `whenUnavailable`. Per flag, on purpose.
 *   2. No row for the key → the flag's declared `whenUnset`. A missing row is
 *      a fresh environment, not an incident.
 *   3. `enabled === false` → false. Matches the schema's own note that
 *      `rolloutPct` is ignored when `enabled` is false: "off" means off, and a
 *      leftover 100 in the percentage column must never resurrect it.
 *   4. Otherwise bucket by `rolloutPct`.
 */
export async function isEnabled(key: FlagKey, userId?: string | null): Promise<boolean> {
  const spec = FLAG_SPECS[key];
  const rows = await snapshot();
  if (rows === null) return spec.whenUnavailable;

  const row = rows.get(key);
  if (!row) return spec.whenUnset;
  if (!row.enabled) return false;
  if (row.rolloutPct >= 100) return true;
  if (row.rolloutPct <= 0) return false;

  // No subject means no stable bucket, and pretending otherwise would put the
  // same anonymous visitor on both sides of the split across two requests.
  // Resolving to false is the safe direction in both cases: a partially-shed
  // kill switch sheds MORE (over-killing beats under-killing in an incident),
  // and an anonymous visitor simply does not get a half-rolled-out feature.
  // Note the operational consequence: a kill switch left at rolloutPct < 100
  // is effectively fully off for signups, which are anonymous by definition.
  // Kill switches are meant to be operated at 100 and toggled with `enabled`.
  if (!userId) return false;

  return rolloutBucket(userId, key) < row.rolloutPct;
}

// ── Admin surface ────────────────────────────────────────────────────────
// Everything below reads and writes the table DIRECTLY, bypassing the cache.
// The admin page must show what is actually stored, not what this process
// happened to read nine seconds ago — an operator checking whether their kill
// landed cannot be shown a cached "on".

export type FlagView = {
  key: string;
  /** False for a stored row whose key is no longer in FLAGS — i.e. rot. */
  known: boolean;
  spec: FlagSpec | null;
  /** False when no row exists yet and the code default is what is in force. */
  stored: boolean;
  enabled: boolean;
  rolloutPct: number;
  /** Null for a flag with no row yet. */
  updatedAt: Date | null;
  updatedBy: string | null;
};

/**
 * Every flag the code knows about, in declaration order, followed by any
 * stored row whose key is NOT in FLAGS. Those orphans are shown rather than
 * hidden: a row nothing reads is dead weight that still looks like a working
 * control, and the only way anyone notices is if the admin page says so.
 */
export async function listFlags(): Promise<FlagView[]> {
  const rows = await db.featureFlag.findMany({ orderBy: { key: "asc" } });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const known: FlagView[] = FLAG_KEYS.map((key) => {
    const spec = FLAG_SPECS[key];
    const row = byKey.get(key);
    return {
      key,
      known: true,
      spec,
      stored: Boolean(row),
      enabled: row ? row.enabled : spec.whenUnset,
      rolloutPct: row ? row.rolloutPct : 100,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });

  const orphans: FlagView[] = rows
    .filter((r) => !isFlagKey(r.key))
    .map((r) => ({
      key: r.key,
      known: false,
      spec: null,
      stored: true,
      enabled: r.enabled,
      rolloutPct: r.rolloutPct,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }));

  return [...known, ...orphans];
}

export function clampRolloutPct(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Upsert one flag, changing only the fields the caller passed.
 *
 * The patch is partial rather than a whole row on purpose. "Turn this off" and
 * "set this to 40%" are different operations, and an incident action must do
 * exactly one thing: an operator hitting the kill button must not also commit
 * whatever half-typed percentage was sitting in a text box next to it, and two
 * admins on the page at once must not clobber each other's unrelated field.
 * Unspecified fields are read back from the stored row, not from the client.
 *
 * The key is validated against FLAGS rather than trusted: this is reached from
 * a form POST, and a Server Action is a public endpoint (see the Next.js
 * Server Actions guide) — without the check, anyone who could reach it could
 * litter the table with keys nothing reads.
 *
 * `description` is rewritten from FLAG_SPECS on every save on purpose. The
 * column exists so the admin page can explain a flag; code is the only place
 * that can keep that explanation true, so code wins.
 */
export async function setFlag(
  key: string,
  patch: { enabled?: boolean; rolloutPct?: number },
  updatedBy: string | null,
): Promise<void> {
  if (!isFlagKey(key)) throw new Error(`Unknown flag key: ${key}`);
  const spec = FLAG_SPECS[key];

  const current = await db.featureFlag.findUnique({ where: { key } });
  const enabled = patch.enabled ?? current?.enabled ?? spec.whenUnset;
  const rolloutPct = clampRolloutPct(patch.rolloutPct ?? current?.rolloutPct ?? 100);

  await db.featureFlag.upsert({
    where: { key },
    create: { key, enabled, rolloutPct, description: spec.description, updatedBy },
    update: { enabled, rolloutPct, description: spec.description, updatedBy },
  });

  invalidateFlagCache();
}

/**
 * Create a row for every flag that does not have one yet, at its declared
 * steady state. `skipDuplicates` makes this create-only: it can be run any
 * number of times and will never overwrite a value an operator set — which
 * matters, because otherwise re-running it during an incident would quietly
 * undo the kill someone just performed.
 *
 * Rows are not required for `isEnabled` to work (a missing row resolves to
 * `whenUnset`), but they are required to have something to toggle.
 */
export async function seedFlags(updatedBy: string | null): Promise<number> {
  const result = await db.featureFlag.createMany({
    data: FLAG_KEYS.map((key) => ({
      key,
      enabled: FLAG_SPECS[key].whenUnset,
      rolloutPct: 100,
      description: FLAG_SPECS[key].description,
      updatedBy,
    })),
    skipDuplicates: true,
  });

  invalidateFlagCache();
  return result.count;
}

/**
 * Delete a stored row whose key is no longer in FLAGS. Restricted to orphans:
 * deleting a live flag's row is survivable (it falls back to `whenUnset`) but
 * it would silently discard an operator's setting, and there is no reason to
 * offer that as a button.
 *
 * `auditRow` — build it with `adminActionRow()` from lib/admin-audit.ts — is
 * written in the SAME TRANSACTION as the delete. This is the one flag operation
 * that destroys data: `setFlag` overwrites a value the log can still describe
 * afterwards, but a deleted row and its `updatedBy`/`updatedAt` are simply gone.
 * Recording it in a second statement would leave a window where the row is
 * destroyed and nothing anywhere says who did it. The parameter is optional so
 * that non-admin callers (and tests) are not forced to fabricate an actor.
 */
export async function deleteOrphanFlag(
  key: string,
  auditRow?: Prisma.AdminAuditLogUncheckedCreateInput,
): Promise<void> {
  if (isFlagKey(key)) throw new Error(`Refusing to delete a live flag: ${key}`);

  if (auditRow) {
    await db.$transaction([
      db.featureFlag.delete({ where: { key } }),
      db.adminAuditLog.create({ data: auditRow }),
    ]);
  } else {
    await db.featureFlag.delete({ where: { key } });
  }

  invalidateFlagCache();
}

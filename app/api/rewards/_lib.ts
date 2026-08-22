import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ── Social rewards: the neutral core ──────────────────────────────────────
//
// Free credits are REAL model spend on the company card (see lib/credits.ts —
// one credit is a fixed $0.002 of underlying spend, so the full 200-credit
// sweep is ~$0.40 given away per account). That single fact sets the bar for
// everything in this directory: a claim has to be *earned*, and a grant has to
// be impossible to repeat.
//
// This module holds only what both claim paths share — config, identity
// hashing, the abuse gates, and the one function that actually writes a grant.
// The two paths themselves are deliberately kept apart:
//
//   ./discord/**  — VERIFIED. Discord's OAuth2 tells us, first-party, whether
//                   the authorizing user is in our guild. A real check.
//   ./social/**   — UNVERIFIED. Instagram / Facebook / LinkedIn expose no way
//                   to ask "does this user follow us". That path is a weaker,
//                   self-declared flow and says so, loudly, in its own file.
//
// Do not blur those two together. The difference is the whole point.

/** Credits per platform. 4 platforms x 50 = 200 total, once per account ever. */
export const REWARD_CREDITS = 50;

export const PLATFORMS = ["discord", "instagram", "facebook", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  discord: "Discord",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

// ── Ledger reason strings are the idempotency key ─────────────────────────
//
// We cannot add a table (the schema is owned elsewhere), and CreditLedger is
// append-only with a free-text `reason`. So `reason` carries the whole state
// machine. Two shapes, and only two:
//
//   reward:<platform>:<identityHash>           delta = +50   a granted reward
//   reward:<platform>:pending:<identityHash>   delta =   0   an unverified claim, on hold
//
// A delta-0 row is a genuine no-op for money: getBalance() reads the newest
// row's balanceAfter, and balanceAfter = balance + 0 preserves it exactly;
// spentInWindow() only sums delta < 0. So the ledger stays arithmetically
// honest while doubling as the only durable store this feature is allowed.
//
// identityHash is what makes ONE grant per EXTERNAL account, not per Kodely
// account — otherwise one Discord login farms fifty signups for 50 credits
// each. Because the hash is in the reason string, "has this external identity
// ever been rewarded?" is a single indexed-ish scan across ALL users.

const REASON_PREFIX = "reward:";

export function grantReason(platform: Platform, identityHash: string): string {
  return `${REASON_PREFIX}${platform}:${identityHash}`;
}

export function pendingReason(platform: Platform, identityHash: string): string {
  return `${REASON_PREFIX}${platform}:pending:${identityHash}`;
}

// ── Config ────────────────────────────────────────────────────────────────
// Every value is read from process.env at call time. Nothing here is ever
// hardcoded, logged, or returned to the browser.

/**
 * Keying the identity hash with a server-side secret (rather than a plain
 * SHA-256) matters more than it looks. Discord snowflakes and Instagram
 * handles are low-entropy and enumerable: an unkeyed digest in a `reason`
 * column would let anyone with read access to the ledger confirm "is
 * @someuser one of your customers?" by brute force. HMAC with a secret they
 * do not have removes that entirely.
 *
 * There is no fallback. Without the key we cannot enforce one-grant-per-
 * identity, and one-grant-per-identity is the only thing standing between
 * this feature and a credit farm — so with the key absent we grant nothing.
 */
export function identitySecret(): string | null {
  const secret = process.env.KODELY_REWARDS_ID_SALT;
  if (!secret || secret.length < 16) return null;
  return secret;
}

export type DiscordConfig = { clientId: string; clientSecret: string; guildId: string };

/** Null unless ALL THREE Discord values are present — a half-configured OAuth client fails at Discord, not here. */
export function discordConfig(): DiscordConfig | null {
  const clientId = process.env.KODELY_DISCORD_CLIENT_ID;
  const clientSecret = process.env.KODELY_DISCORD_CLIENT_SECRET;
  const guildId = process.env.KODELY_DISCORD_GUILD_ID;
  if (!clientId || !clientSecret || !guildId) return null;
  return { clientId, clientSecret, guildId };
}

/** Where we send the user to actually do the thing. Absent URL = reward hidden. */
export function platformUrl(platform: Platform): string | null {
  const env: Record<Platform, string | undefined> = {
    discord: process.env.KODELY_DISCORD_INVITE_URL,
    instagram: process.env.KODELY_INSTAGRAM_URL,
    facebook: process.env.KODELY_FACEBOOK_URL,
    linkedin: process.env.KODELY_LINKEDIN_URL,
  };
  return env[platform]?.trim() || null;
}

/**
 * A reward is offered only when it is fully configured. Discord additionally
 * needs its OAuth client, because without it there is no verification and we
 * would be shipping exactly the honour-system button this feature refuses to
 * be. Nothing throws: an unconfigured reward simply does not exist.
 */
export function isPlatformConfigured(platform: Platform): boolean {
  if (identitySecret() === null) return false;
  if (platformUrl(platform) === null) return false;
  if (platform === "discord") return discordConfig() !== null;
  return true;
}

export function configuredPlatforms(): Platform[] {
  return PLATFORMS.filter(isPlatformConfigured);
}

// ── Identity hashing ──────────────────────────────────────────────────────

/**
 * Stable, secret-keyed fingerprint of an external account. Namespaced by
 * platform so the same string on two platforms is two identities, and
 * truncated to 96 bits — far past any collision concern at this scale, and
 * short enough to keep `reason` readable in an admin query.
 *
 * Returns null when unkeyed; callers must treat that as "cannot grant".
 */
export function identityHash(platform: Platform, externalId: string): string | null {
  const secret = identitySecret();
  if (secret === null) return null;
  return createHmac("sha256", secret)
    .update(`${platform}:${externalId}`)
    .digest("hex")
    .slice(0, 24);
}

// ── Abuse gates ───────────────────────────────────────────────────────────

/**
 * A brand-new account cannot claim. The farm pattern this feature invites is
 * "sign up, claim 200, abandon, repeat", and every step of it is cheap except
 * waiting. A day of latency costs a real user nothing (they keep their 750
 * signup credits meanwhile) and costs a script the only thing it cannot batch.
 */
export const MIN_ACCOUNT_AGE_HOURS = 24;

/**
 * Velocity is the signal that actually matters here. Per-user velocity is
 * already bounded — four rewards, ever — so the meaningful measurement is
 * GLOBAL: a legitimate day sees a trickle of reward grants, while a farm
 * being run against us shows up as a burst. Above the ceiling we stop
 * granting entirely and shout in the logs, rather than quietly bleeding
 * credits until someone reads a dashboard.
 *
 * Deliberately a circuit breaker, not a queue: claims are not lost, the user
 * is told to come back, and a human gets to look first.
 */
export const VELOCITY_WINDOW_MINUTES = 60;
export const VELOCITY_LIMIT = 25;

export type Denial =
  | "not_configured"
  | "account_too_new"
  | "already_claimed"
  | "identity_already_used"
  | "velocity_tripped";

export function accountTooNew(userCreatedAt: Date): boolean {
  return Date.now() - userCreatedAt.getTime() < MIN_ACCOUNT_AGE_HOURS * 3_600_000;
}

async function velocityTripped(tx: Prisma.TransactionClient | typeof db): Promise<boolean> {
  const since = new Date(Date.now() - VELOCITY_WINDOW_MINUTES * 60_000);
  const recent = await tx.creditLedger.count({
    where: { reason: { startsWith: REASON_PREFIX }, delta: { gt: 0 }, createdAt: { gte: since } },
  });
  return recent >= VELOCITY_LIMIT;
}

/** Has THIS user already been granted this platform's reward? */
export async function hasClaimed(userId: string, platform: Platform): Promise<boolean> {
  const row = await db.creditLedger.findFirst({
    where: { userId, reason: { startsWith: `${REASON_PREFIX}${platform}:` }, delta: { gt: 0 } },
    select: { id: true },
  });
  return row !== null;
}

/** Has this EXTERNAL identity been rewarded on any Kodely account, ever? */
export async function identityAlreadyUsed(
  platform: Platform,
  hash: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<boolean> {
  const row = await tx.creditLedger.findFirst({
    where: { reason: grantReason(platform, hash), delta: { gt: 0 } },
    select: { id: true },
  });
  return row !== null;
}

/** The pending (unverified) claim for this user+platform, if one exists. */
export async function pendingClaim(userId: string, platform: Platform) {
  return db.creditLedger.findFirst({
    where: { userId, reason: { startsWith: `${REASON_PREFIX}${platform}:pending:` } },
    orderBy: { createdAt: "desc" },
    select: { reason: true, createdAt: true },
  });
}

// ── Granting ──────────────────────────────────────────────────────────────

/**
 * Serialize claims that could collide, using Postgres advisory locks.
 *
 * Both uniqueness rules here are read-then-write, and CreditLedger has no
 * unique constraint on `reason` for us to lean on (we cannot touch the
 * schema). Under a double-submitted form or two browser tabs, two requests
 * can both read "not yet granted" and both insert — a real double-spend of
 * real money. A transaction alone does not fix it: Postgres defaults to READ
 * COMMITTED, so the re-read inside the transaction still will not see the
 * uncommitted sibling.
 *
 * Advisory locks do fix it, need no migration, and are released automatically
 * when the transaction ends (including on error). Both are taken in a fixed
 * order — user first, then identity — so two interleaved claims can never
 * deadlock against each other.
 *
 * $executeRaw, NOT $queryRaw, and that is not a slip. pg_advisory_xact_lock
 * returns `void`; $queryRaw tries to deserialize that column and throws
 * "Failed to deserialize column of type 'void'". $executeRaw discards rows
 * and returns a count, which is all we want. Verified against this app's own
 * Postgres: the lock is taken, is re-entrant within the transaction, and is
 * released when the transaction ends.
 */
const LOCK_NAMESPACE = 0x4b4f_4445 | 0; // "KODE"

function lockKey(input: string): number {
  const secret = identitySecret() ?? "unkeyed";
  return createHmac("sha256", secret).update(input).digest().readInt32BE(0);
}

/**
 * Write a grant, or explain why not. The ONLY place in this feature that
 * increases a balance.
 *
 * Mirrors lib/credits.ts `grantCredits` deliberately rather than calling it:
 * that helper binds to the global client, and the whole point of this
 * function is that the balance read and the ledger insert happen inside the
 * same locked transaction. Same row shape, same balanceAfter arithmetic.
 */
export async function grantReward(
  userId: string,
  platform: Platform,
  hash: string,
): Promise<{ ok: true; credits: number } | { ok: false; reason: Denial }> {
  if (identitySecret() === null) return { ok: false, reason: "not_configured" };

  const userLock = lockKey(`user:${userId}`);
  const identityLock = lockKey(`identity:${platform}:${hash}`);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int4, ${userLock}::int4)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int4, ${identityLock}::int4)`;

    const mine = await tx.creditLedger.findFirst({
      where: { userId, reason: { startsWith: `${REASON_PREFIX}${platform}:` }, delta: { gt: 0 } },
      select: { id: true },
    });
    if (mine) return { ok: false as const, reason: "already_claimed" as const };

    if (await identityAlreadyUsed(platform, hash, tx)) {
      return { ok: false as const, reason: "identity_already_used" as const };
    }

    if (await velocityTripped(tx)) {
      console.error(
        `[rewards] velocity ceiling hit (>=${VELOCITY_LIMIT} grants in ${VELOCITY_WINDOW_MINUTES}m) — refusing ${platform} grant. Investigate before raising this.`,
      );
      return { ok: false as const, reason: "velocity_tripped" as const };
    }

    const latest = await tx.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { balanceAfter: true },
    });
    const balance = latest?.balanceAfter ?? 0;

    await tx.creditLedger.create({
      data: {
        userId,
        delta: REWARD_CREDITS,
        reason: grantReason(platform, hash),
        balanceAfter: balance + REWARD_CREDITS,
      },
    });

    return { ok: true as const, credits: REWARD_CREDITS };
  });
}

/**
 * Record an unverified claim as a delta-0 ledger row. Grants nothing.
 *
 * The zero delta is load-bearing and slightly delicate: getBalance() reads the
 * NEWEST row's balanceAfter, so this row has to carry the balance forward
 * exactly or it would silently rewrite someone's balance. Hence the same
 * locked read-then-insert as grantReward rather than a bare create with a
 * balance read from outside the transaction.
 *
 * (A build charge committing between this transaction's read and its insert
 * would still be clobbered — that race is inherent to the ledger's
 * read-then-write shape and predates this feature; see chargeForBuild and
 * grantCredits in lib/credits.ts, which have it too. The lock at least stops
 * rewards racing rewards, which is the part this feature introduced.)
 */
export async function recordPending(
  userId: string,
  platform: Platform,
  hash: string,
): Promise<{ ok: true } | { ok: false; reason: Denial }> {
  const userLock = lockKey(`user:${userId}`);
  const identityLock = lockKey(`identity:${platform}:${hash}`);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int4, ${userLock}::int4)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int4, ${identityLock}::int4)`;

    // Anything at all for this user+platform — granted or already pending —
    // means we are done. Re-declaring would otherwise restart the hold clock
    // and let someone shop for a handle that passes.
    const existing = await tx.creditLedger.findFirst({
      where: { userId, reason: { startsWith: `${REASON_PREFIX}${platform}:` } },
      select: { id: true },
    });
    if (existing) return { ok: false as const, reason: "already_claimed" as const };

    // Re-checked INSIDE the lock, not just at the route. Two accounts
    // declaring the same handle at the same moment would both pass an
    // unlocked check, and the loser would only find out 72 hours later when
    // their claim was refused.
    const taken = await tx.creditLedger.findFirst({
      where: {
        reason: { in: [grantReason(platform, hash), pendingReason(platform, hash)] },
      },
      select: { id: true },
    });
    if (taken) return { ok: false as const, reason: "identity_already_used" as const };

    const latest = await tx.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { balanceAfter: true },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: 0,
        reason: pendingReason(platform, hash),
        balanceAfter: latest?.balanceAfter ?? 0,
      },
    });

    return { ok: true as const };
  });
}

/** Pull the identity hash back out of a `reward:<platform>:pending:<hash>` reason. */
export function hashFromPendingReason(reason: string): string | null {
  const parts = reason.split(":");
  return parts.length === 4 && parts[0] === "reward" && parts[2] === "pending"
    ? parts[3]
    : null;
}

// ── Status, as the settings page sees it ──────────────────────────────────

export type RewardState =
  | "available" // nothing done yet
  | "pending" // unverified claim recorded, hold period still running
  | "claimable" // unverified claim, hold elapsed, credits waiting
  | "claimed" // granted
  | "locked"; // account too new

export type RewardStatus = {
  platform: Platform;
  label: string;
  url: string;
  credits: number;
  verified: boolean;
  state: RewardState;
  /** ISO timestamp a pending claim becomes claimable. */
  readyAt: string | null;
  /**
   * Whole hours left on the hold, computed server-side on purpose. The client
   * renders this number rather than diffing readyAt against its own clock,
   * which would differ between the server render and hydration and trip a
   * mismatch warning on every page load.
   */
  readyInHours: number | null;
};

/** Hours an unverified claim sits before it pays out. See ./social/_unverified.ts. */
export const UNVERIFIED_HOLD_HOURS = 72;

export async function rewardStatuses(user: {
  id: string;
  createdAt: Date;
}): Promise<RewardStatus[]> {
  const platforms = configuredPlatforms();
  if (platforms.length === 0) return [];

  const tooNew = accountTooNew(user.createdAt);

  return Promise.all(
    platforms.map(async (platform): Promise<RewardStatus> => {
      const url = platformUrl(platform) as string;
      const verified = platform === "discord";
      const base = {
        platform,
        label: PLATFORM_LABELS[platform],
        url,
        credits: REWARD_CREDITS,
        verified,
      };

      if (await hasClaimed(user.id, platform)) {
        return { ...base, state: "claimed", readyAt: null, readyInHours: null };
      }
      if (tooNew) return { ...base, state: "locked", readyAt: null, readyInHours: null };

      if (!verified) {
        const pending = await pendingClaim(user.id, platform);
        if (pending) {
          const ready = new Date(
            pending.createdAt.getTime() + UNVERIFIED_HOLD_HOURS * 3_600_000,
          );
          const msLeft = ready.getTime() - Date.now();
          return {
            ...base,
            state: msLeft <= 0 ? "claimable" : "pending",
            readyAt: ready.toISOString(),
            readyInHours: msLeft <= 0 ? 0 : Math.ceil(msLeft / 3_600_000),
          };
        }
      }

      return { ...base, state: "available", readyAt: null, readyInHours: null };
    }),
  );
}

// ── Misc ──────────────────────────────────────────────────────────────────

/**
 * Behind the Cloudflare -> host-nginx -> VM-nginx chain, req.url is the
 * internal 127.0.0.1:PORT the proxy forwards to, and X-Forwarded-Proto gets
 * clobbered by the Flexible-SSL hops. Same derivation the Google OAuth routes
 * use — the redirect_uri must match byte-for-byte across start and callback.
 */
export function originFromRequest(req: Request): string {
  const host = req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  return `https://${host}`;
}

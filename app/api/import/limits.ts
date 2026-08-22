/**
 * Rate limiting for the site import.
 *
 * ## Why this is here and not in lib/rate-limit.ts
 *
 * Partly scope — this change is not allowed to edit that file — but the shape
 * is also right. lib/rate-limit.ts holds two different things: a durable,
 * LoginAttempt-backed limiter for the pre-auth routes, where losing the counter
 * on a restart means an unlimited password-guessing window; and
 * `checkEnhanceRateLimit`, a plain in-memory speed bump for an authenticated
 * route whose events leave no row to count.
 *
 * This is the second kind, and for the same reasons: an import writes nothing
 * to the database, so there is nothing to count, and a throwaway page read does
 * not justify its own table. Per-process, resets on deploy, and that is the
 * right weight. If the import ever grows a persistent record (which it should,
 * see the audit log in the route), moving the counter onto that record is the
 * obvious upgrade.
 *
 * ## Why the keying is per USER and not per IP
 *
 * `lib/rate-limit.ts`'s `clientIp` reasoning applies in full and is worth not
 * repeating badly: behind Cloudflare only `cf-connecting-ip` is trustworthy,
 * because Cloudflare APPENDS to a client-supplied `x-forwarded-for` rather than
 * replacing it, so the first XFF entry is a string the attacker chose and
 * keying on it hands them a fresh bucket per request.
 *
 * None of that arises here, because this route is authenticated. There is a
 * real user id, it costs a signup to obtain, and the signup route is itself
 * IP-limited by the durable limiter. That is a stronger key than any header.
 * It is also the reason the URL field is only offered to signed-in users at
 * all: an anonymous server-side fetcher is an open proxy with a rate limit, and
 * "rate limit it per user" has no meaning without a user.
 *
 * ## Three counters, not one
 *
 * PER USER bounds what one account can do.
 *
 * PER TARGET HOST bounds what we can do to one victim. This is the counter the
 * per-user rule cannot provide, and it is the one an abuse report is about: a
 * hundred accounts pointed at one small server is a DDoS with our name on the
 * packets, and each of those accounts is comfortably inside its own limit while
 * it happens. Keyed on the hostname the user asked for.
 *
 * THE GLOBAL CAP bounds what every account can do together, because this route
 * is an outbound traffic amplifier: one small POST becomes a full page fetch
 * from our IP.
 *
 * THE BREAKER answers the other failure mode — somebody using the feature as a
 * network scanner. Legitimate use produces almost no blocked addresses; a burst
 * of them means either a probe or a bug, and in both cases the right response
 * is to stop fetching for a while and leave a log line.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Per user. A burst rule and a patience rule, same shape as the login limiter. */
const USER_RULES = [
  { limit: 5, windowMs: 10 * MINUTE },
  { limit: 20, windowMs: HOUR },
];

/**
 * Every import by everyone, per hour. Sized as a ceiling on us as a traffic
 * source rather than as a limit anyone should notice: 20 users importing their
 * hourly maximum simultaneously is well inside it, and a hundred accounts
 * hammering one victim's server is not.
 */
const GLOBAL_LIMIT = 200;

/**
 * Requests to any one hostname, per hour, across every account.
 *
 * Ten is generous for the honest cases — one person importing their own site a
 * few times while they fix a typo, or a handful of people who genuinely like
 * the same reference site — and it is nowhere near enough to be a load problem
 * for whoever is on the other end.
 */
const HOST_LIMIT = 10;

/** Blocked-address refusals that trip the breaker, and how long it stays open. */
const BREAKER_THRESHOLD = 15;
const BREAKER_WINDOW_MS = 10 * MINUTE;
const BREAKER_COOLDOWN_MS = 15 * MINUTE;

export type Verdict = { allowed: boolean; retryAfterSeconds?: number };

const userHits = new Map<string, number[]>();
const hostHits = new Map<string, number[]>();
let globalHits: number[] = [];
let blockedHits: number[] = [];
let breakerUntil = 0;

function prune(times: number[], now: number, windowMs: number): number[] {
  return times.filter((t) => t > now - windowMs);
}

/**
 * Consume one import against every counter, or say why not.
 *
 * Consumes up front rather than on success, deliberately. An import that is
 * refused because the address was private still cost a DNS lookup from our
 * network, and "the attempts that fail are free" is how a limiter turns into a
 * scanner's throttle rather than its wall.
 */
export function checkImportRateLimit(userId: string, targetHost: string): Verdict {
  const now = Date.now();

  if (now < breakerUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((breakerUntil - now) / 1000) };
  }

  // Bound the maps. Clearing wholesale is acceptable here in a way it is not
  // for the login limiter — these counters never protect anyone's account, and
  // the global cap below survives the clear and keeps amplification bounded.
  if (userHits.size > 5_000) userHits.clear();
  if (hostHits.size > 5_000) hostHits.clear();

  const longest = Math.max(...USER_RULES.map((r) => r.windowMs));
  const mine = prune(userHits.get(userId) ?? [], now, longest);

  for (const rule of USER_RULES) {
    const inWindow = mine.filter((t) => t > now - rule.windowMs);
    if (inWindow.length < rule.limit) continue;
    userHits.set(userId, mine);
    const binding = inWindow[inWindow.length - rule.limit];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((binding + rule.windowMs - now) / 1000)),
    };
  }

  const host = targetHost.toLowerCase();
  const theirs = prune(hostHits.get(host) ?? [], now, HOUR);
  if (theirs.length >= HOST_LIMIT) {
    userHits.set(userId, mine);
    hostHits.set(host, theirs);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((theirs[0] + HOUR - now) / 1000)),
    };
  }

  globalHits = prune(globalHits, now, HOUR);
  if (globalHits.length >= GLOBAL_LIMIT) {
    userHits.set(userId, mine);
    hostHits.set(host, theirs);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((globalHits[0] + HOUR - now) / 1000)),
    };
  }

  // Nothing is consumed until every rule has passed, so a request refused by
  // the host rule does not also spend the user's own allowance.
  mine.push(now);
  userHits.set(userId, mine);
  theirs.push(now);
  hostHits.set(host, theirs);
  globalHits.push(now);
  return { allowed: true };
}

/**
 * Record that an import was refused because its address was not public.
 *
 * Called only for the `blocked` outcome — not for a timeout, a 404 or a
 * non-HTML answer, all of which are ordinary. Enough of these in a short window
 * and the whole feature stops for everyone, which is the correct trade: the
 * feature is a convenience and the thing it would be doing instead is mapping
 * our internal network on somebody's behalf.
 */
export function noteBlockedTarget(): void {
  const now = Date.now();
  blockedHits = prune(blockedHits, now, BREAKER_WINDOW_MS);
  blockedHits.push(now);
  if (blockedHits.length >= BREAKER_THRESHOLD) {
    breakerUntil = now + BREAKER_COOLDOWN_MS;
    blockedHits = [];
    console.error(
      `[kodely] site-import breaker tripped: ${BREAKER_THRESHOLD} blocked addresses in ${
        BREAKER_WINDOW_MS / MINUTE
      } minutes. Imports refused for ${BREAKER_COOLDOWN_MS / MINUTE} minutes.`,
    );
  }
}

/** Test seam. Nothing on the request path calls this. */
export function resetImportLimits(): void {
  userHits.clear();
  hostHits.clear();
  globalHits = [];
  blockedHits = [];
  breakerUntil = 0;
}

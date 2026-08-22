import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";

// Credits already cap spend per build, but nothing stops a broken or
// malicious client from firing many rapid requests before a human notices —
// and a free, unmetered *.kodely.site subdomain is a spam/phishing vector
// independent of credit spend. These are coarse, cheap safety nets, not a
// content-moderation system (there is no classifier here — a page can still
// be abusive content and pass both checks; that's a separate, harder problem
// left for a dedicated moderation pass, not faked here with a weak heuristic).

const GENERATE_LIMIT = 20; // per user, per rolling hour
const PUBLISH_LIMIT = 15; // new (first-time) publishes per user, per rolling day
const ENHANCE_LIMIT = 40; // per user, per rolling hour

export async function checkGenerateRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - 60 * 60_000);
  const count = await db.build.count({
    where: { project: { userId }, createdAt: { gte: since } },
  });
  if (count < GENERATE_LIMIT) return { allowed: true };
  return { allowed: false, retryAfterSeconds: 3600 };
}

export async function checkPublishRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  // Counts DISTINCT projects touched by a publish in the window, not publish
  // events — republishing the same project repeatedly still counts once.
  // That's the right shape: the abuse case is many distinct spam subdomains,
  // not heavy iteration on one real site (which credits already gate).
  const count = await db.project.count({
    where: { userId, publishedAt: { gte: since } },
  });
  if (count < PUBLISH_LIMIT) return { allowed: true };
  return { allowed: false, retryAfterSeconds: 86_400 };
}

// ── Support tickets ───────────────────────────────────────────────────────
//
// KEYED ON THE USER, NOT THE IP, and counted in the database. Both halves are
// deliberate, because the obvious thing to copy here is the wrong thing:
// app/api/contact/route.ts throttles per IP in a process-local Map, and its
// own comment admits it is "a speed bump rather than a guarantee". That is a
// defensible trade for an UNAUTHENTICATED form where there is no user id to
// key on. Here there is one, and copying the IP-keyed version would inherit
// three faults for nothing — it resets on deploy, it multiplies by the process
// count, and it punishes everyone behind one office NAT for one person's
// runaway client while leaving that person a fresh bucket from their phone.
//
// So this follows checkGenerateRateLimit instead: count the rows the feature
// already writes, inside a rolling window, keyed by the account. Durable
// across deploys, correct across processes, and it needs no table of its own.
//
// TWO WINDOWS, for the same reason the login rules have two: the hour stops a
// stuck client hammering the composer, and the day stops someone pacing
// themselves just under it. Sized to be invisible to a person with a genuinely
// bad afternoon — five separate problems in an hour is already a lot — while
// bounding what one account can put in the operator queue.
const TICKET_LIMIT_HOUR = 5;
const TICKET_LIMIT_DAY = 20;

/** Replies are cheaper than new threads and are the point of the feature, so
    the ceiling is high enough that a real back-and-forth never touches it. */
const TICKET_MESSAGE_LIMIT_HOUR = 40;

export async function checkSupportTicketRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const now = Date.now();
  const [inHour, inDay] = await Promise.all([
    db.supportTicket.count({ where: { userId, createdAt: { gte: new Date(now - 60 * 60_000) } } }),
    db.supportTicket.count({
      where: { userId, createdAt: { gte: new Date(now - 24 * 60 * 60_000) } },
    }),
  ]);
  if (inHour >= TICKET_LIMIT_HOUR) return { allowed: false, retryAfterSeconds: 3600 };
  if (inDay >= TICKET_LIMIT_DAY) return { allowed: false, retryAfterSeconds: 86_400 };
  return { allowed: true };
}

/** Messages the customer has sent across ALL of their tickets in the last
    hour — per account, so opening five threads does not multiply the budget. */
export async function checkSupportMessageRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const count = await db.supportMessage.count({
    where: {
      author: "CUSTOMER",
      ticket: { userId },
      createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
    },
  });
  if (count < TICKET_MESSAGE_LIMIT_HOUR) return { allowed: true };
  return { allowed: false, retryAfterSeconds: 3600 };
}

// In memory, and synchronous, unlike the two checks above — an enhance leaves
// nothing in the database to count. It writes no files, creates no build row
// and charges no credits by design (see lib/enhance.ts), and a throwaway
// suggestion does not justify its own table. So this is per-process and resets
// on every deploy: a speed bump, exactly like the contact form's throttle, and
// the right weight for a call that costs a fraction of a cent. The real
// spending gate is still checkGenerateRateLimit plus the credit meter — those
// sit in front of the only thing here that costs real money.
//
// The ceiling is deliberately well above checkGenerateRateLimit's 20 builds an
// hour: enhancing several drafts before committing to one build is the whole
// point of the feature, and a limit that punished that would fight it.
const enhanceHits = new Map<string, number[]>();

export function checkEnhanceRateLimit(userId: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const cutoff = now - 60 * 60_000;
  const recent = (enhanceHits.get(userId) ?? []).filter((t) => t > cutoff);

  // Bound the map so a long-lived process can't accumulate one entry per user
  // forever. Clearing wholesale (rather than evicting) briefly resets everyone
  // — acceptable for a speed bump, and it never denies a legitimate request.
  if (enhanceHits.size > 5000) enhanceHits.clear();

  if (recent.length >= ENHANCE_LIMIT) {
    enhanceHits.set(userId, recent);
    // Wait until the oldest hit in the window ages out, not a flat hour.
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((recent[0] - cutoff) / 1000)),
    };
  }

  recent.push(now);
  enhanceHits.set(userId, recent);
  return { allowed: true };
}

// ===========================================================================
// PRE-AUTH limiting (login / signup)
// ===========================================================================
//
// Everything above keys on `userId`, so none of it can run before a session
// exists. Login and signup are the two routes that are reachable by anyone and
// that are worth attacking: unlimited password guessing on one side, and on the
// other a free account that is immediately granted SIGNUP_GRANT credits — real
// model spend, minted by a POST.
//
// STORAGE: the `LoginAttempt` table. One row per attempt that was actually
// charged to a bucket, `(scope, key, createdAt)`, where `key` is a client IP or
// a salted digest of an email and never a plaintext address. Rows live at most
// as long as the longest rule window (a day) — see the prune below.
//
// WHY THE TABLE IS NOT READ ON THE REQUEST PATH. Prisma is async, and the two
// gates below are synchronous — `app/api/auth/login/route.ts` calls
// `checkLoginRateLimit(req, email)` without awaiting it, and it must stay that
// way, both because a route change is out of scope and because a synchronous
// check is what closes the concurrency hole documented on that function. So the
// shape here is a DURABLE LEDGER (LoginAttempt) with an in-process INDEX over
// the live window in front of it:
//
//   * a verdict is computed from the in-process index — no query, no await;
//   * a consumed attempt is appended to the index synchronously AND queued as
//     one INSERT (queued, never awaited, so the request never waits on it);
//   * every RECONCILE_MS the index is rebuilt from the table, which is also how
//     it is populated in the first place after a restart. The two login scopes
//     are rebuilt on every tick; the slow-moving signup scope every
//     FULL_RECONCILE_MS, because it is the one that costs anything to read.
//
// That is the whole point of the change: the counters are no longer lost when
// the process restarts, because the process's memory is a cache of the table
// rather than the only copy. Two consequences worth stating plainly:
//
//   * MULTI-PROCESS: no longer multiplies by the process count, but it does not
//     compose instantly either — two processes converge within RECONCILE_MS on
//     the login scopes and FULL_RECONCILE_MS on signup. A cluster gets a limit
//     that is off by at most one interval of traffic per extra process, instead
//     of one that is off by a factor of N. It is still worth saying that a
//     shared in-memory store (Redis) is the answer if this ever becomes a real
//     cluster; this makes N processes tolerable, not correct.
//   * COLD START: the index is empty until the first reconcile finishes, and a
//     verdict computed from an empty index would be the fail-open behaviour
//     this change exists to remove. So the gates fail CLOSED until then — see
//     `hydrated` below. That is one 429 with `Retry-After: 1` per process
//     lifetime, not one per user.
//
// WRITE VOLUME under attack is bounded by the limits themselves, not by request
// rate: a blocked attempt returns before `record`, so it writes nothing at all.
// Once an attacker trips a bucket every further guess from them is a pure
// in-memory comparison. The only DB work that scales with anything is the
// reconcile — a fixed one or two queries per interval per process, whatever the
// request rate — and the prune, which runs on the same timer.
//
// FAIL DIRECTION: closed. A request whose client IP cannot be established (see
// clientIp) is not waved through — it lands in one shared, strict bucket. Same
// answer for a database outage: both auth routes read the same Postgres this
// limiter lives in, so an outage already breaks login and signup. Failing
// closed there costs nothing that is not already lost, while failing open would
// turn any DB blip into an unlimited-guessing window.

/**
 * The client's IP, as the key for a pre-auth bucket.
 *
 * WHICH HEADER, AND WHY IT MATTERS: this app sits behind Cloudflare → host
 * nginx → VM nginx, so the socket peer is always a proxy and the address has to
 * come from a header. Only ONE header here is trustworthy:
 *
 *  * `cf-connecting-ip` — SET by Cloudflare on every request, overwriting
 *    whatever the client sent. A client cannot forge it through the edge. This
 *    is the one we use.
 *  * `x-forwarded-for` FIRST entry — ATTACKER-CONTROLLED. Cloudflare *appends*
 *    to any XFF the client supplied rather than replacing it, so entry 0 is
 *    simply a string the caller chose. Keying on it means an attacker gets a
 *    fresh bucket per request and the limiter does nothing. (That is exactly
 *    finding M3 against app/api/contact/route.ts, which is why this file does
 *    not repeat it.)
 *  * `x-forwarded-for` LAST entry — useless here, though not spoofable. Each
 *    nginx hop appends the address of the hop *before* it, so the last entry on
 *    arrival is our own front nginx, a constant. Keying on it would put every
 *    visitor on the planet in one bucket.
 *
 * NO `cf-connecting-ip` ⇒ the request did not come through the edge (local dev,
 * a health check, or someone hitting the origin IP directly). Next gives a route
 * handler no socket address to fall back on, so all such traffic shares one
 * bucket named below. That is deliberate and fails closed: direct-to-origin
 * traffic is throttled as a single collective client rather than being exempt.
 *
 * RESIDUAL, for the record: an attacker who can reach the origin IP directly,
 * bypassing Cloudflare, CAN forge `cf-connecting-ip` — no application code can
 * detect that. The fix is at the edge, not here: restrict the origin's firewall
 * to Cloudflare's published ranges (or use an authenticated origin pull). That
 * is infrastructure work outside this repo and it is not done as far as this
 * checkout can tell.
 *
 * IP is also imperfect in the other direction, and knowingly so: a NAT'd office
 * or a carrier-grade NAT presents hundreds of real people as one key. The limits
 * below are sized with that in mind, and login refunds successful attempts
 * (see noteLoginSuccess) precisely so a busy shared address is not spent by
 * people who typed their password correctly.
 */
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.toLowerCase();
  return "no-edge";
}

// Emails are hashed before they are used as a bucket key. The table would
// otherwise be a running plaintext list of every address anyone tried to sign in
// as — including typos and addresses that have no account — which is a pile of
// personal data this feature has no reason to hold. The IP scopes store the
// address itself, which the schema's key contract allows and which is no more
// than any access log keeps, and for less time: nothing here outlives a day.
//
// THE SALT MUST BE STABLE ACROSS RESTARTS, which is the one thing that changed
// when this became durable. It used to be `randomBytes(16)` per process; with a
// durable bucket that would hand every account a brand-new, empty bucket on
// every deploy — precisely the failure this change exists to remove — so it is
// a constant instead. Set LOGIN_KEY_SALT to a secret to upgrade the digest from
// "a pseudonym anyone holding the source can recompute" to one that also needs
// the secret. Rotating it resets every account bucket exactly once, which is
// harmless: the windows are fifteen minutes and an hour.
const EMAIL_KEY_SALT = process.env.LOGIN_KEY_SALT ?? "kodely:login-attempt:v1";
function emailKey(email: string): string {
  return createHash("sha256").update(`${EMAIL_KEY_SALT}:${email.trim().toLowerCase()}`).digest("hex");
}

type Rule = { limit: number; windowMs: number };
type Verdict = { allowed: boolean; retryAfterSeconds?: number };

/** Matches LoginAttempt.scope. One table, three independent buckets. */
type Scope = "ip" | "account" | "signup";

/**
 * One consumed attempt. `id` is the LoginAttempt primary key.
 *
 * `settledAt` is when this process last knew the row to be committed — the
 * moment its INSERT resolved, or, for a hit read back out of the table, the row
 * timestamp itself. It stays undefined while the INSERT is still queued or in
 * flight, and if the INSERT fails it stays undefined for good. A reconcile uses
 * it to tell "the read has not caught up with me yet" (keep the hit) from "the
 * read is authoritative and this row is gone" (drop it) — see `reconcile`.
 */
type Hit = { id: string; at: number; settledAt?: number };

type Store = { scope: Scope; rules: Rule[]; hits: Map<string, Hit[]> };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Two windows per bucket rather than one: a short window stops a burst, and a
// long one stops a patient attacker who paces themselves just under it.
const LOGIN_IP_RULES: Rule[] = [
  { limit: 20, windowMs: 15 * MINUTE },
  { limit: 60, windowMs: HOUR },
];

// Per ACCOUNT, across every source address. This is the rule that actually
// answers credential stuffing, where the whole point is that each guess arrives
// from a different IP. Tighter than the per-IP rule because a single account
// legitimately sees very few failures.
//
// The tradeoff is real and is chosen with eyes open: anyone can burn a victim's
// account bucket on purpose and cost them a login for a few minutes. That is
// why this is a ROLLING WINDOW that heals by itself, never a sticky lockout
// flag, and why a correct password clears it immediately — the victim's next
// attempt after the window slides succeeds, and no operator action is needed.
// An indefinite lockout would trade password guessing for a denial-of-service
// against any account whose email address is known.
const LOGIN_EMAIL_RULES: Rule[] = [
  { limit: 5, windowMs: 15 * MINUTE },
  { limit: 20, windowMs: HOUR },
];

// Signup is a volume problem, not a guessing problem: one source minting many
// accounts. Every account that lands costs SIGNUP_GRANT credits of real model
// spend, so the daily rule is the one that bounds the money.
//
// Sized to be invisible to humans and to a shared office address (five accounts
// an hour from one IP is already an odd thing for real people to do) while
// capping what a single address can mint per day. A distributed botnet still
// gets one bucket per address — no IP-keyed limiter can fix that, and the
// answers to it are email verification before the grant lands, or deferring the
// grant until first build. Both are outside this file.
const SIGNUP_IP_RULES: Rule[] = [
  { limit: 5, windowMs: HOUR },
  { limit: 15, windowMs: DAY },
];

const loginIp: Store = { scope: "ip", rules: LOGIN_IP_RULES, hits: new Map() };
const loginAccount: Store = { scope: "account", rules: LOGIN_EMAIL_RULES, hits: new Map() };
const signupIp: Store = { scope: "signup", rules: SIGNUP_IP_RULES, hits: new Map() };
const STORES: Store[] = [loginIp, loginAccount, signupIp];
const STORE_BY_SCOPE = new Map<string, Store>(STORES.map((s) => [s.scope, s]));

// Ceiling on distinct keys per store, so a flood of unique addresses cannot
// grow memory without bound.
const MAX_KEYS = 20_000;

function longestWindow(rules: Rule[]): number {
  return Math.max(...rules.map((r) => r.windowMs));
}

function highestLimit(rules: Rule[]): number {
  return Math.max(...rules.map((r) => r.limit));
}

/** The longest window any rule uses. Nothing older can affect any verdict. */
const MAX_WINDOW = Math.max(...STORES.map((s) => longestWindow(s.rules)));

/**
 * Keep a store under MAX_KEYS.
 *
 * NOTE the difference from checkEnhanceRateLimit above, which clears wholesale
 * when it grows too large. That is fine for a speed bump on an authenticated
 * route; here it would be a vulnerability — an attacker could flood unique keys
 * to force a clear and wipe the very counter that is throttling them. So this
 * only ever drops entries that are already expired, and if that is not enough,
 * evicts the LEAST recently active first. An attacker's own bucket is by
 * definition the most recently active, so it is the last thing to go.
 *
 * Eviction is a memory decision only, never a durability one: the rows stay in
 * LoginAttempt, so an evicted key comes back at the next reconcile with its
 * count intact.
 */
function sweep(store: Store, now: number): void {
  if (store.hits.size <= MAX_KEYS) return;
  const windowMs = longestWindow(store.rules);

  for (const [key, hits] of store.hits) {
    if (hits.length === 0 || hits[hits.length - 1].at <= now - windowMs) store.hits.delete(key);
  }
  if (store.hits.size <= MAX_KEYS) return;

  const byLastSeen = [...store.hits.entries()].sort(
    (a, b) => a[1][a[1].length - 1].at - b[1][b[1].length - 1].at,
  );
  for (const [key] of byLastSeen.slice(0, store.hits.size - MAX_KEYS)) store.hits.delete(key);
}

/** Read-only: would one more hit on this key breach any of its rules? */
function check(store: Store, key: string): Verdict {
  const now = Date.now();
  const rules = store.rules;
  const hits = (store.hits.get(key) ?? []).filter((h) => h.at > now - longestWindow(rules));

  let retryAfterSeconds = 0;
  for (const rule of rules) {
    const inWindow = hits.filter((h) => h.at > now - rule.windowMs);
    if (inWindow.length < rule.limit) continue;
    // Wait only until enough hits age out of THIS window, not a flat period.
    const binding = inWindow[inWindow.length - rule.limit];
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.max(1, Math.ceil((binding.at + rule.windowMs - now) / 1000)),
    );
  }

  return retryAfterSeconds > 0 ? { allowed: false, retryAfterSeconds } : { allowed: true };
}

// ---------------------------------------------------------------------------
// Durable side: one serialised write queue, plus tombstones
// ---------------------------------------------------------------------------

/**
 * Every mutation is queued here and never awaited by a request.
 *
 * SERIALISED, not merely fire-and-forget, and that ordering is load-bearing:
 * `refund` deletes the row that `record` inserts, and if the DELETE could
 * overtake the INSERT the row would survive and the refund would silently do
 * nothing. One chain guarantees the two run in call order. The chain never
 * rejects — a failed write is dropped, because the alternative (throwing into a
 * request that has already been answered) helps nobody, and the next reconcile
 * re-reads whatever actually landed.
 */
let writes: Promise<unknown> = Promise.resolve();
function enqueueWrite(run: () => Promise<unknown>): void {
  writes = writes.then(() => run().catch(() => undefined));
}

/**
 * Rows we have deleted (or are about to) whose DELETE may not have committed
 * before an in-flight reconcile read them. Without this a refund could be
 * undone by a read that started a moment earlier. Id ⇒ expiry.
 */
const tombstones = new Map<string, number>();
/** Buckets cleared by a successful login. `scope\0key` ⇒ the moment of clearing. */
const cleared = new Map<string, number>();
const TOMBSTONE_MS = 60_000;

function bucketId(scope: Scope, key: string): string {
  return `${scope}:${key}`;
}

/**
 * Consume one hit: append to the index synchronously, queue the row.
 *
 * `createdAt` is set from this process's clock rather than left to the database
 * default, so that a row and the in-memory hit it mirrors carry the SAME
 * timestamp. `check` measures every window against `Date.now()`, and letting the
 * two clocks disagree would move hits across a window edge at each reconcile.
 */
function record(store: Store, key: string): void {
  const now = Date.now();
  sweep(store, now);
  const hits = (store.hits.get(key) ?? []).filter((h) => h.at > now - longestWindow(store.rules));
  const hit: Hit = { id: randomUUID(), at: now };
  hits.push(hit);
  store.hits.set(key, hits);

  const scope = store.scope;
  enqueueWrite(async () => {
    await db.loginAttempt.create({ data: { id: hit.id, key, scope, createdAt: new Date(hit.at) } });
    hit.settledAt = Date.now();
  });
}

/**
 * Give back the single most recent hit on a key.
 *
 * WHY A DELETE, AND NOT A COMPENSATING ROW. A row here is not a record that an
 * event occurred — LoginAttempt has no outcome column, nothing reads it but this
 * file, and nothing in the product or the admin surfaces it. It is one unit of
 * budget that has been spent. Handing the unit back therefore means removing the
 * row: the table is a counter, and the honest way to decrement a counter made of
 * rows is to delete one. A "negative" marker would mean the count query stops
 * being `count(*)` over an index range and becomes a signed sum, which is
 * strictly slower, and it would leave rows that outlive their own window and
 * still change a verdict. If this table ever needs to double as an audit log,
 * that is a different table with a different retention answer, not a sign bit
 * bolted onto this one.
 *
 * WHICH row: the newest for the key, which is what the in-memory predecessor did
 * (`hits.pop()`). It is not necessarily the row this very request inserted — a
 * concurrent attempt from the same IP may have landed in between — but the
 * effect on every window that contains both is identical, and picking the newest
 * is the conservative choice, since giving back an older hit would extend the
 * bucket's memory rather than shorten it.
 */
function refund(store: Store, key: string): void {
  const hits = store.hits.get(key);
  const hit = hits?.pop();
  if (!hits || !hit) return;
  if (hits.length === 0) store.hits.delete(key);

  tombstones.set(hit.id, Date.now() + TOMBSTONE_MS);
  enqueueWrite(() => db.loginAttempt.deleteMany({ where: { id: hit.id } }));
}

/**
 * Empty a bucket outright: the account half of a successful login.
 *
 * Deletes by `(scope, key)` rather than by the ids this process happens to know,
 * so guesses recorded against the same account by another process — or before a
 * restart — go too. Bounded to rows that existed at the moment of success, so a
 * guess arriving during the delete is still counted.
 */
function clearBucket(store: Store, key: string): void {
  const at = Date.now();
  store.hits.delete(key);
  cleared.set(bucketId(store.scope, key), at);

  const scope = store.scope;
  enqueueWrite(() =>
    db.loginAttempt.deleteMany({ where: { scope, key, createdAt: { lte: new Date(at) } } }),
  );
}

// ---------------------------------------------------------------------------
// Reconcile: rebuild the in-process index from LoginAttempt
// ---------------------------------------------------------------------------

const RECONCILE_MS = 10_000;

/**
 * How often the SIGNUP scope is re-read, as opposed to the two login scopes.
 *
 * The login scopes need an hour of history and the signup scope needs a day, and
 * that difference is the whole cost of a reconcile. An hour's rows are a bounded
 * backward walk of LoginAttempt_createdAt_idx that stops at the window edge
 * (measured: 1305 rows, 24 buffers, 0.3ms against a 30k-row table). A day's
 * signup rows are most of the signup rows there are — the prune keeps barely
 * more than a day — so once the table is large enough Postgres will and should
 * stop using an index for them and read the table instead (measured: 3.5ms).
 * There is no index that makes "most of a column's rows" cheap, so the answer is
 * to ask less often rather than to ask differently. Signup is the slow-moving
 * bucket — five an hour per address — and a minute of divergence between two
 * processes is nothing against a daily cap of fifteen.
 */
const FULL_RECONCILE_MS = 60_000;

/**
 * Cap on rows pulled per query. A guard against a pathological table, not an
 * expected case: the prune keeps at most a day of rows, and the limits cap what
 * one key can contribute. If it ever binds, `truncated` below degrades the
 * limiter to its old in-memory behaviour rather than to no limiter at all.
 */
const MAX_RECONCILE_ROWS = 20_000;

/**
 * Rebuild the index from the table.
 *
 * `allScopes` false rebuilds only the two login scopes, which is the common
 * tick; the signup scope is left exactly as it is. See FULL_RECONCILE_MS.
 */
async function reconcile(allScopes: boolean): Promise<void> {
  const startedAt = Date.now();
  const stores = allScopes ? STORES : STORES.filter((s) => s.scope !== "signup");

  // TWO queries rather than one over the longest window, because the two halves
  // want different windows and different plans:
  //  * an hour covers both login scopes, and `createdAt > $cutoff ORDER BY
  //    "createdAt" DESC` is a backward scan of LoginAttempt_createdAt_idx that
  //    stops at the window edge — its cost is the rows it returns, nothing more;
  //  * a day of signup rows is fetched separately, so the cheap query is not
  //    dragged out to 24× its width by a scope that changes far more slowly.
  // The hour of signup rows the first query also returns is deduplicated by id.
  const columns = { id: true, scope: true, key: true, createdAt: true } as const;
  const [recent, signups] = await Promise.all([
    db.loginAttempt.findMany({
      where: { createdAt: { gt: new Date(startedAt - HOUR) } },
      select: columns,
      orderBy: { createdAt: "desc" },
      take: MAX_RECONCILE_ROWS,
    }),
    allScopes
      ? db.loginAttempt.findMany({
          where: { scope: "signup", createdAt: { gt: new Date(startedAt - DAY) } },
          select: columns,
          orderBy: { createdAt: "desc" },
          take: MAX_RECONCILE_ROWS,
        })
      : [],
  ]);
  const truncated = recent.length >= MAX_RECONCILE_ROWS || signups.length >= MAX_RECONCILE_ROWS;

  const next = new Map<Scope, Map<string, Hit[]>>(stores.map((s) => [s.scope, new Map()]));
  const seen = new Set<string>();

  // Rows arrive newest-first, so a bucket that has already collected its rule
  // ceiling can stop: the ones left are older and cannot change any verdict.
  for (const row of [...recent, ...signups]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const store = STORE_BY_SCOPE.get(row.scope);
    const bucket = store && next.get(store.scope);
    if (!store || !bucket) continue;

    const at = row.createdAt.getTime();
    if (at <= startedAt - longestWindow(store.rules)) continue;
    if (tombstones.has(row.id)) continue;
    const clearedAt = cleared.get(bucketId(store.scope, row.key));
    if (clearedAt !== undefined && at <= clearedAt) continue;

    const arr = bucket.get(row.key) ?? [];
    if (arr.length >= highestLimit(store.rules)) continue;
    arr.push({ id: row.id, at, settledAt: at });
    bucket.set(row.key, arr);
  }

  // Union with what this process holds that the read could not have seen: hits
  // recorded while the queries were in flight, and hits whose INSERT has not
  // committed yet. Read here, at apply time, so a refund or a clear that
  // happened during the queries is already reflected.
  //
  // The test is `settledAt`, not "recorded recently". The difference matters as
  // soon as there is more than one process: a hit of ours that we KNOW was
  // committed before the read began, and that the read did not return, is a row
  // another process has refunded or cleared. Re-adding it on a timer would
  // resurrect somebody else's refund for the length of that timer. A hit whose
  // INSERT has not resolved, on the other hand, is genuinely invisible to the
  // read and must be carried over, or a burst would lose everything it recorded
  // while a reconcile was in flight.
  for (const store of stores) {
    const bucket = next.get(store.scope);
    if (!bucket) continue;
    const windowMs = longestWindow(store.rules);

    for (const [key, hits] of store.hits) {
      for (const hit of hits) {
        if (seen.has(hit.id) || tombstones.has(hit.id)) continue;
        if (hit.at <= startedAt - windowMs) continue;
        if (!truncated && hit.settledAt !== undefined && hit.settledAt <= startedAt) continue;
        const arr = bucket.get(key) ?? [];
        arr.push(hit);
        bucket.set(key, arr);
      }
    }
  }

  const now = Date.now();
  for (const store of stores) {
    const bucket = next.get(store.scope);
    if (!bucket) continue;
    // `check` reads oldest-first.
    for (const hits of bucket.values()) hits.sort((a, b) => a.at - b.at);
    store.hits = bucket;
    sweep(store, now);
  }

  for (const [id, expiry] of tombstones) if (expiry <= now) tombstones.delete(id);
  for (const [id, at] of cleared) if (at + TOMBSTONE_MS <= now) cleared.delete(id);
}

// ---------------------------------------------------------------------------
// Prune
// ---------------------------------------------------------------------------

// WHY HERE AND NOT IN lib/retention.ts. Two reasons, one of them decisive.
//
// The decisive one: this file is the only one in scope, so adding a fifth rule
// to the retention policy is not mine to do. Someone who wants it there should
// read the second reason first, because I do not think it belongs there.
//
// A retention rule answers "how long should we keep data that still means
// something", and every rule in that file is a judgement call with a reader
// behind it — sessions, snapshots, analytics, Stripe idempotency. A LoginAttempt
// older than MAX_WINDOW means nothing to anybody: no query can reach it, no
// verdict can be changed by it, no product surface reads this table at all. It
// is not retained data, it is spent counter state, and collecting it is part of
// operating the counter rather than a policy anyone should have to weigh in on.
// Putting it in the policy file would also make correctness depend on a cron
// entry that (per that file's own header) nothing runs yet — the table would
// grow unbounded until someone wired up a job, which is a poor property for a
// table on the login path.
//
// So it runs here, on the reconcile timer rather than on the request path: an
// attacker's traffic must never be able to trigger extra DB work, and a delete
// on a request would do exactly that. Batched, with a ceiling per pass, for the
// same reason lib/retention.ts batches — no statement holds locks long enough
// to be noticed by someone signing in.
const PRUNE_EVERY_MS = 10 * MINUTE;
const PRUNE_BATCH = 500;
const PRUNE_MAX_BATCHES = 40;
/** Slack past MAX_WINDOW. A row at the edge is already unreadable; this just
 *  keeps the prune from racing the window it is trailing. */
const PRUNE_GRACE_MS = HOUR;

let lastPruneAt = 0;

// Select-then-delete rather than one `DELETE ... WHERE id IN (SELECT ...)`, for
// the same reason lib/retention.ts is shaped this way — and for one more.
// LoginAttempt.createdAt is `timestamp(3)` WITHOUT a time zone, and a JS Date
// interpolated into $executeRaw is bound as `timestamptz`, so Postgres converts
// it using the session's TimeZone before comparing. On a server that is not on
// UTC that silently moves the cutoff by the local offset — measured here as
// seven hours, which would have pruned rows that were still inside their own
// window. The Prisma query builder knows the column's type and binds correctly.
async function prune(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_WINDOW - PRUNE_GRACE_MS);
  for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
    // An ordered range scan of LoginAttempt_createdAt_idx with a LIMIT, then a
    // delete by primary key.
    const stale = await db.loginAttempt.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: PRUNE_BATCH,
    });
    if (stale.length === 0) return;
    await db.loginAttempt.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    if (stale.length < PRUNE_BATCH) return;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** False until the index has been built from the table at least once. */
let hydrated = false;
let started = false;
let cycle: Promise<void> | null = null;
let lastFullAt = 0;

function runCycle(force = false): Promise<void> {
  if (cycle) return cycle;
  cycle = (async () => {
    try {
      // A process's first cycle is always a full one: there is nothing in memory
      // yet for a partial one to leave alone.
      const allScopes = force || !hydrated || Date.now() - lastFullAt >= FULL_RECONCILE_MS;
      await reconcile(allScopes);
      if (allScopes) lastFullAt = Date.now();
      hydrated = true;
      if (Date.now() - lastPruneAt >= PRUNE_EVERY_MS) {
        lastPruneAt = Date.now();
        await prune();
      }
    } catch {
      // The database is unreachable. Both auth routes are broken anyway; stay
      // closed if we never hydrated, and keep serving the last known index if
      // we did. Retried on the next tick either way.
    } finally {
      cycle = null;
    }
  })();
  return cycle;
}

/**
 * Started by the first gate call rather than at import time, deliberately: a
 * module-level query would run during `next build`, which imports route modules
 * and has no business needing a database.
 */
function ensureStarted(): void {
  if (started) return;
  started = true;
  void runCycle();
  const timer = setInterval(() => void runCycle(), RECONCILE_MS) as unknown as {
    unref?: () => void;
  };
  // Never hold the process open for a counter refresh.
  timer.unref?.();
}

/** The verdict before the index exists. See COLD START above. */
function cold(): Verdict {
  return { allowed: false, retryAfterSeconds: 1 };
}

/**
 * Flush queued writes and rebuild the index from the table, immediately.
 *
 * Nothing on the request path needs this — the timer does it — but it is what
 * makes the durable behaviour testable without waiting on wall-clock intervals,
 * and it is the hook to call from a script that has just changed LoginAttempt
 * out from under a running process. It is additive: no existing signature moved,
 * so neither auth route changes.
 */
export async function syncLoginAttempts(): Promise<void> {
  ensureStarted();
  // Twice: a cycle already in flight may have read the table before the writes
  // being flushed here committed, so the first pass only guarantees that cycle
  // is over. The second is guaranteed to start after them.
  await writes;
  await runCycle(true);
  await writes;
  await runCycle(true);
}

/**
 * Gate one sign-in attempt. Call BEFORE looking the user up or hashing
 * anything, and treat `allowed: false` as the end of the request.
 *
 * WHY THIS CONSUMES ON EVERY ATTEMPT RATHER THAN COUNTING FAILURES: counting
 * only failures means the counter is written after `verifyPassword` resolves,
 * and everything between is an `await`. A thousand concurrent guesses would all
 * pass the check before the first failure was ever recorded — the limiter would
 * read as correct and stop nothing. Consuming up front closes that window,
 * because the check and the record here happen in one synchronous run with no
 * await between them. It is also why the durable counter is read from an index
 * in memory rather than queried: a `SELECT count(*)` would put an await back in
 * the middle of the gate and reopen the hole this closes. A correct password is
 * then refunded by noteLoginSuccess, which gets back the failure-counting
 * behaviour without the race.
 *
 * The verdict is identical whether or not `email` belongs to a real account —
 * the account bucket fills on attempts, not on hits — so a 429 tells an
 * enumerating caller nothing that a 401 would not.
 */
export function checkLoginRateLimit(req: Request, email: string): Verdict {
  ensureStarted();
  if (!hydrated) return cold();

  const ip = clientIp(req);
  const account = emailKey(email);

  // Both verdicts are taken before either is consumed. Otherwise an attacker
  // already blocked on their own IP would keep filling victims' account buckets
  // — turning a limiter into a lockout tool.
  const byIp = check(loginIp, ip);
  const byAccount = check(loginAccount, account);
  if (!byIp.allowed || !byAccount.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(byIp.retryAfterSeconds ?? 0, byAccount.retryAfterSeconds ?? 0),
    };
  }

  record(loginIp, ip);
  record(loginAccount, account);
  return { allowed: true };
}

/**
 * Call after a password verifies. Clears the account's bucket outright, and
 * refunds this attempt against the IP's.
 *
 * The two are treated differently on purpose. Clearing the account bucket is
 * safe: whoever just proved they hold the password is entitled to that account.
 * The IP bucket is only REFUNDED — one hit, the successful one — so that a NAT
 * shared by hundreds of people is never spent by people signing in correctly,
 * while an attacker who happens to own one valid account cannot log into it
 * repeatedly to wipe the guesses they are making against everyone else.
 */
export function noteLoginSuccess(req: Request, email: string): void {
  ensureStarted();
  clearBucket(loginAccount, emailKey(email));
  refund(loginIp, clientIp(req));
}

/**
 * Gate one signup attempt. Call once the request is well-formed and BEFORE the
 * existence check, so that hammering signup to learn which emails are already
 * registered is throttled by the same counter as account minting.
 *
 * Consumes on every attempt, with no refund for success — unlike login, a
 * successful signup is precisely the expensive event we are limiting.
 */
export function checkSignupRateLimit(req: Request): Verdict {
  ensureStarted();
  if (!hydrated) return cold();

  const ip = clientIp(req);
  const verdict = check(signupIp, ip);
  if (!verdict.allowed) return verdict;
  record(signupIp, ip);
  return { allowed: true };
}

/**
 * The one message either auth route shows when it throttles. Uniform by
 * design: it must not differ between the per-IP and the per-account rule, or
 * between a registered address and an unregistered one, because the difference
 * would itself be the answer to "does this account exist".
 */
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a moment and try again.";

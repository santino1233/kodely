/**
 * The NAMES of the two auth cookies, and the pure helpers for reading the
 * non-sensitive one — deliberately in a module with no imports at all.
 *
 * It exists because three places that must never disagree about these names
 * cannot all import lib/auth.ts:
 *
 *   - lib/auth.ts itself, which owns writing both cookies;
 *   - proxy.ts, which runs on every request and must not drag Prisma (and
 *     therefore lib/db.ts, which lib/auth.ts imports) into the proxy bundle;
 *   - components/marketing/useSignedIn.ts, which runs in the BROWSER and
 *     could not import a server-only module even if it wanted to.
 *
 * Copying the strings into each would be the same mistake getCurrentSession
 * in lib/auth.ts already argues against: a nav that quietly disagrees with
 * the real cookie name shows the wrong thing forever and looks like a bug in
 * sign-in rather than a typo in a constant.
 */

/** The real session cookie. httpOnly, opaque token, hashed in the database. */
export const SESSION_COOKIE = "kodely_session";

/**
 * The HINT cookie. Readable by JavaScript, on purpose, and therefore it must
 * carry nothing worth stealing: no user id, no email, no name, no role, no
 * token, no fragment of one. Its entire vocabulary is the single literal
 * "1" below, which means "a session cookie was present when this was
 * written" and nothing else. An attacker who reads it, forges it, or hands
 * it to someone else gains exactly one thing: a marketing nav that says
 * "Portal" and a /dashboard that bounces them to /login, because every
 * authenticated surface still goes through getCurrentUser() and the database.
 *
 * It exists so that a STATICALLY PRERENDERED marketing page — which cannot
 * read a cookie on the server, by definition — can still show the right two
 * nav links without the whole marketing site being forced dynamic.
 */
export const AUTH_HINT_COOKIE = "kodely_auth";

/** The only value the hint cookie is ever given. Anything else reads false. */
export const AUTH_HINT_VALUE = "1";

/**
 * Matches SESSION_DAYS in lib/auth.ts. It is a ceiling, not a promise: the
 * hint is written alongside a real session with the real session's expiry
 * wherever that expiry is known, and proxy.ts deletes any hint whose session
 * cookie has gone. This constant is only for the backfill path in the proxy,
 * which has no database and therefore no way to learn the true expiry.
 */
export const AUTH_HINT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * True when a cookie string contains the hint. Takes the raw string (either
 * `document.cookie` in the browser or a Cookie header on the server) rather
 * than a parsed jar, so the same function is usable from both and testable
 * from neither.
 */
export function readAuthHint(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false;
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== AUTH_HINT_COOKIE) continue;
    return part.slice(eq + 1).trim() === AUTH_HINT_VALUE;
  }
  return false;
}

/**
 * What proxy.ts should do about the hint, given what the request carried.
 *
 * Split out as a pure function because the interesting behaviour is a
 * two-cookie truth table, and the failure that matters — telling a signed-out
 * visitor they are signed in — lives in exactly one of its four rows.
 *
 *   session  hint   ->  action
 *   ------------------------------------------------------------------
 *   yes      yes        "none"   the ordinary signed-in request
 *   no       no         "none"   the ordinary anonymous request
 *   yes      no         "set"    a session that predates this feature
 *   no       yes        "clear"  STALE: the session cookie is gone
 *
 * Only the two disagreement rows touch the response, so neither an anonymous
 * visitor nor a settled signed-in one ever gets a Set-Cookie header they did
 * not need — which is what keeps this safe to run in front of the
 * statically-cached blog pages.
 */
export function authHintAction(
  hasSession: boolean,
  hasHint: boolean,
): "none" | "set" | "clear" {
  if (hasSession === hasHint) return "none";
  return hasSession ? "set" : "clear";
}

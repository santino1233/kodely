import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";
import { SESSION_COOKIE, AUTH_HINT_COOKIE, AUTH_HINT_VALUE } from "./auth-cookies";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// SESSION_COOKIE moved to ./auth-cookies, same string, same everything —
// proxy.ts and a browser component now need the name too and neither can
// import this file (it pulls in Prisma). See that file for the reasoning.
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

// Session tokens are stored hashed, so a database read never yields a usable cookie.
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // ── ADDED: the public "someone is signed in" hint ────────────────────────
  // BEHAVIOUR CHANGE, flagged: every sign-in now writes a SECOND cookie
  // beside the session one. It is deliberately NOT httpOnly, because the
  // whole point is that browser JavaScript on a statically prerendered
  // marketing page can read it; everything about what it may therefore
  // contain (nothing) is argued in lib/auth-cookies.ts.
  //
  // Same expiry as the session, so the browser drops both in the same
  // instant and the hint can never outlive what it is hinting at. Same path
  // and sameSite, so it travels exactly as far. `secure` matches too — a
  // hint that survived on http:// while the session did not would be the
  // stale-hint bug by construction.
  jar.set(AUTH_HINT_COOKIE, AUTH_HINT_VALUE, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
  // ── ADDED, and the half of the hint that actually matters ────────────────
  // A hint left behind here is the whole failure mode of this feature: the
  // marketing nav would go on offering "Portal" to someone who just signed
  // out, and /dashboard would bounce them to /login. Deleted in the same
  // function as the session so the two cannot drift — sign-out has exactly
  // one implementation (app/api/auth/logout/route.ts calls this), so there
  // is no second path that could forget.
  jar.delete(AUTH_HINT_COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/**
 * The Session ROW behind the current cookie, rather than the user on it.
 *
 * Additive: nothing that existed before this function behaves differently.
 *
 * It exists because a sessions list has to be able to say "this is the one you
 * are using" and a revoke route has to refuse to cut its own caller off, and
 * both of those need the session id — which `getCurrentUser` deliberately
 * throws away. The alternative was to re-derive it at the call site, which
 * means copying SESSION_COOKIE and hashToken out of this file. A settings
 * screen that quietly disagrees with the real cookie name would mark the wrong
 * row as "this device", and there is no worse lie to tell on a security page.
 *
 * Same expiry rule as getCurrentUser: an expired row resolves to null rather
 * than to a session, so the two can never disagree about being signed in.
 */
export async function getCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Signed in AND role === "ADMIN". Returns null otherwise — callers decide
 * between a 404 and a redirect rather than getting a thrown error.
 *
 * app/admin/layout.tsx already gates the admin section, and that check is the
 * real one. This exists so each admin PAGE and API route can assert the same
 * thing itself: Next's own guidance is not to treat a layout as the sole
 * authorization boundary, since layouts don't re-render on every navigation
 * within a section and route handlers don't sit under them at all. Belt and
 * braces on a page showing cost, margin, and customer prompts.
 */
export async function getAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === "ADMIN" ? user : null;
}

import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkLoginRateLimit, noteLoginSuccess, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A syntactically valid hash that no password can ever match: same scheme and
// the same 16-byte salt / 64-byte key lengths as lib/auth.ts writes, so
// verifyPassword does its full scrypt derivation and then fails the compare.
//
// It exists so the "no such account" path costs the same as the "wrong
// password" path. Without it, verifyPassword is skipped entirely when the email
// is unknown and the route answers in a millisecond instead of ~100ms — a clean
// oracle for whether an address is registered, which would undo the constant
// SHAPE the response body already keeps.
const ABSENT_ACCOUNT_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // Before the user lookup and before scrypt: an attacker must not be able to
  // spend the server's CPU, or learn anything from the database, past the
  // limit. Keyed on the client IP and on the account being targeted — see
  // lib/rate-limit.ts for why both, and for which header the IP comes from.
  const gate = checkLoginRateLimit(req, email);
  if (!gate.allowed) {
    return Response.json(
      { error: RATE_LIMITED_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfterSeconds ?? 60) },
      },
    );
  }

  const user = await db.user.findUnique({ where: { email } });
  // Constant-shape response whether or not the account exists, to avoid
  // leaking which emails are registered. A Google-only account has no local
  // password to check against — it never verifies here (correctly, they
  // must use "Continue with Google" instead), and takes the same decoy hash
  // as a nonexistent account so it costs the same time too.
  const ok =
    (await verifyPassword(password, user?.passwordHash ?? ABSENT_ACCOUNT_HASH)) &&
    Boolean(user?.passwordHash);
  if (!user || !ok) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  // Proof of the password: hand back what this attempt cost the limiter, so
  // ordinary sign-ins never accumulate toward a throttle.
  noteLoginSuccess(req, email);

  await createSession(user.id);
  return Response.json({ id: user.id, email: user.email });
}

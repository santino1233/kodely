import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { grantCredits, SIGNUP_GRANT } from "@/lib/credits";
import { createSeedProject } from "@/lib/seed-project";
import { track, EVENTS } from "@/lib/events";
import { checkSignupRateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string; name?: string }
    | null;

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // ── Kill switch ──────────────────────────────────────────────────────────
  // After the shape checks (a malformed body still gets the specific answer
  // that tells the person how to fix it) and before everything with a side
  // effect: the rate-limit counter that `record()`s a hit against this IP, the
  // existence lookup, db.user.create, the SIGNUP_GRANT of real model spend, the
  // seed project and the session cookie. A refused signup leaves no user row,
  // no ledger row, no project and no session.
  //
  // Ahead of the existence check on purpose. That 409 is the only response on
  // this route that differs for a registered address, i.e. the enumeration
  // oracle the rate limiter above exists to bound. A route that cannot create
  // an account has no business still answering it.
  //
  // ANONYMOUS BY NATURE — there is no subject id to pass, because the whole
  // point is that this person has no account yet. Per lib/flags.ts, a check
  // with no subject resolves to false for ANY rolloutPct below 100, so a
  // half-set percentage here is not a half-rollout, it is a full stop. This
  // flag must be operated at rolloutPct 100 and toggled with `enabled` — which
  // is how a kill switch is meant to be operated anyway. The same note is on
  // the Google callback, the other half of this switch.
  if (!(await isEnabled(FLAGS.signups))) {
    return Response.json(
      {
        error:
          "New sign-ups are paused right now. No account was created — please try again a little later.",
      },
      { status: 503 },
    );
  }

  // Deliberately AFTER the shape checks — a malformed body never created an
  // account, so there is nothing to meter — but BEFORE the existence check
  // below, which is the only response on this route that differs for a
  // registered address and is therefore an enumeration oracle. One counter now
  // bounds both that and the thing that actually costs money: every account
  // that lands here is immediately granted SIGNUP_GRANT credits of real model
  // spend. Keyed per client IP; see lib/rate-limit.ts for the header choice.
  const gate = checkSignupRateLimit(req);
  if (!gate.allowed) {
    return Response.json(
      { error: RATE_LIMITED_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfterSeconds ?? 60) },
      },
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = await db.user.create({
    data: { email, passwordHash: await hashPassword(password), name: body?.name?.trim() || null },
  });

  await grantCredits(user.id, SIGNUP_GRANT, "signup_grant");
  await createSeedProject(user.id);
  await createSession(user.id);

  track(EVENTS.signedUp, { userId: user.id, props: { method: "password" } });

  return Response.json({ id: user.id, email: user.email });
}

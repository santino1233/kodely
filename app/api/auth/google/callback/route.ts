import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { grantCredits, SIGNUP_GRANT } from "@/lib/credits";
import { createSeedProject } from "@/lib/seed-project";
import { track, EVENTS } from "@/lib/events";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "kodely_google_oauth_state";

type GoogleTokenResponse = { access_token?: string; id_token?: string; error?: string };
type GoogleUserInfo = { sub: string; email?: string; email_verified?: boolean; name?: string };

// Behind nginx, req.url reflects the internal 127.0.0.1:PORT the proxy
// forwards to, not the public host the visitor actually used — must match
// exactly what /start sent as redirect_uri, or Google rejects the exchange.
function originFromRequest(req: Request): string {
  const host = req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  // See the matching comment in the /start route — X-Forwarded-Proto isn't
  // trustworthy across this app's Flexible-SSL proxy chain.
  return `https://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFromRequest(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${origin}/login?error=google_not_configured`, 302);
  }
  if (!code || !state || state !== expectedState) {
    return Response.redirect(`${origin}/login?error=google_failed`, 302);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !tokens.access_token) {
      return Response.redirect(`${origin}/login?error=google_failed`, 302);
    }

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = (await infoRes.json()) as GoogleUserInfo;
    if (!infoRes.ok || !info.email || !info.email_verified) {
      return Response.redirect(`${origin}/login?error=google_failed`, 302);
    }

    const email = info.email.trim().toLowerCase();
    let user = await db.user.findUnique({ where: { googleId: info.sub } });

    if (!user) {
      // Link to an existing email/password account rather than creating a
      // second one for the same person.
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        user = await db.user.update({ where: { id: existing.id }, data: { googleId: info.sub } });
      } else {
        // ── Kill switch — the NEW ACCOUNT branch only ────────────────────────
        // Scope is the whole point of putting it here rather than at the top of
        // the route. Everything above this line is an existing user signing in:
        // matched on googleId, or matched on email and linked a line earlier.
        // Both fall through to createSession below and are completely
        // unaffected while signups are off, which is what the flag's own
        // description promises ("existing users are unaffected"). Only the
        // branch that mints a brand new account is gated.
        //
        // Before db.user.create, and therefore before the SIGNUP_GRANT, the
        // seed project, the signedUp event and the session — a refused
        // first-time sign-in leaves nothing behind. The Google OAuth code was
        // already spent by the time this route ran; nothing from it is stored.
        //
        // ANONYMOUS, exactly like the password signup route: no account exists
        // yet, so there is no subject id to bucket on and any rolloutPct below
        // 100 resolves to false (see lib/flags.ts). Operate this flag at 100%
        // and toggle `enabled`.
        //
        // The redirect carries a specific code rather than reusing
        // `google_failed`, which would be a lie — Google worked perfectly and
        // telling the user to "try again or use email" would send them at a
        // signup route that is also off. NOTE: app/(auth)/login/page.tsx maps
        // only the two google_* codes and falls back to "Something went wrong."
        // for anything else, so today this shows a generic banner. Adding
        // `signups_paused` to GOOGLE_ERRORS in the login and signup pages is
        // the one-line follow-up that makes it read as well as it should.
        if (!(await isEnabled(FLAGS.signups))) {
          return Response.redirect(`${origin}/login?error=signups_paused`, 302);
        }

        user = await db.user.create({
          data: { email, googleId: info.sub, name: info.name?.trim() || null },
        });
        await grantCredits(user.id, SIGNUP_GRANT, "signup_grant");
        await createSeedProject(user.id);
        // Only on a genuinely new account — linking Google to an existing
        // email/password user is not a signup and must not inflate the funnel.
        track(EVENTS.signedUp, { userId: user.id, props: { method: "google" } });
      }
    }

    await createSession(user.id);
    return Response.redirect(`${origin}/continue`, 302);
  } catch {
    return Response.redirect(`${origin}/login?error=google_failed`, 302);
  }
}

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { grantCredits, SIGNUP_GRANT } from "@/lib/credits";
import { createSeedProject } from "@/lib/seed-project";

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
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
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
        user = await db.user.create({
          data: { email, googleId: info.sub, name: info.name?.trim() || null },
        });
        await grantCredits(user.id, SIGNUP_GRANT, "signup_grant");
        await createSeedProject(user.id);
      }
    }

    await createSession(user.id);
    return Response.redirect(`${origin}/continue`, 302);
  } catch {
    return Response.redirect(`${origin}/login?error=google_failed`, 302);
  }
}

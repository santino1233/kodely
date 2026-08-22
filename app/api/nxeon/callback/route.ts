import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { exchangeSsoCode, nxeonEnabled } from "@/lib/nxeon";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://kodely.me";
const STATE_COOKIE = "kodely_nxeon_sso_state";

function done(outcome: string): Response {
  return Response.redirect(`${APP_URL}/dashboard/domains?nxeon=${outcome}`, 302);
}

/**
 * Finish linking a Nxeon account. Verifies the CSRF state, exchanges the
 * code, and stores the linked identity — with one case the reference
 * integration kit did not handle: a P2002 conflict on User.nxeonUserId, which
 * means this Nxeon account is ALREADY linked to a different Kodely account.
 * Silently overwriting either side there would let one customer's session
 * quietly start spending from another customer's Nxeon wallet, so it is
 * treated as a hard stop, never a partial link.
 */
export async function GET(req: Request) {
  if (!nxeonEnabled()) return done("unavailable");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;

  if (!code || !state || !expected || state !== expected) return done("error");

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${APP_URL}/login`, 302);

  let identity: Awaited<ReturnType<typeof exchangeSsoCode>>;
  try {
    identity = await exchangeSsoCode(code);
  } catch (err) {
    console.error("[nxeon] SSO code exchange failed", err);
    return done("error");
  }

  try {
    await db.user.update({ where: { id: user.id }, data: { nxeonUserId: identity.userId } });
  } catch (err) {
    const code2 = (err as { code?: string })?.code;
    if (code2 === "P2002") {
      // Someone else's Kodely account already holds this Nxeon identity.
      // Nothing was changed on either account.
      return done("already_linked_elsewhere");
    }
    throw err;
  }

  track(EVENTS.nxeonLinked, { userId: user.id });

  const res = Response.redirect(`${APP_URL}/dashboard/domains?nxeon=linked`, 302);
  return copyCookieClear(res);
}

/** Response.redirect() headers are immutable, so the cookie is cleared by
    constructing a fresh Response that carries the same redirect plus a
    Set-Cookie that expires the state cookie immediately. */
function copyCookieClear(base: Response): Response {
  return new Response(null, {
    status: base.status,
    headers: {
      Location: base.headers.get("Location") ?? "",
      "Set-Cookie": `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    },
  });
}

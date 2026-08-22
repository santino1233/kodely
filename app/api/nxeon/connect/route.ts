import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { nxeonAuthorizeUrl, nxeonEnabled } from "@/lib/nxeon";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://kodely.me";
const STATE_COOKIE = "kodely_nxeon_sso_state";

/**
 * Start linking a Nxeon account. Same shape as the Discord reward flow
 * (app/api/rewards/discord/start): a random state nonce goes into a
 * short-lived cookie, the browser is sent to NXEON's OWN login/register page
 * (never a Kodely password), and the callback below re-checks the nonce.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${APP_URL}/login`, 302);

  if (!nxeonEnabled()) {
    console.error("[nxeon] /connect hit without full config (NXEON_BASE_URL / _PARTNER_KEY / _WEBHOOK_SECRET / _REDIRECT_URI).");
    return Response.redirect(`${APP_URL}/dashboard/domains?nxeon=unavailable`, 302);
  }

  const state = randomBytes(24).toString("base64url");

  // Response.redirect()'s headers are immutable here — build the redirect by
  // hand so the state cookie can be attached, same as the Discord and Google
  // OAuth start routes.
  return new Response(null, {
    status: 302,
    headers: {
      Location: nxeonAuthorizeUrl(state),
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    },
  });
}

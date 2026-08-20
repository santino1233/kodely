import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "kodely_google_oauth_state";

// Inert until real GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are configured —
// same "ships now, activates when credentials land" pattern already used
// for Stripe billing (see lib/stripe.ts). Redirect_uri is derived from the
// request's own origin so this works on staging and prod without
// hardcoding either — both origins' /api/auth/google/callback must be
// added as authorized redirect URIs in the Google Cloud OAuth client.
// Behind nginx, req.url reflects the internal 127.0.0.1:PORT the proxy
// forwards to, not the public host the visitor actually used — the same
// Host-header derivation the publish route already relies on.
function originFromRequest(req: Request): string {
  const host = req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  // The Cloudflare -> host-nginx -> VM-nginx chain runs Flexible SSL (each
  // hop is plain HTTP even though the real visitor connection is HTTPS), so
  // X-Forwarded-Proto gets clobbered along the way and can't be trusted —
  // same reason the publish route hardcodes https rather than deriving it.
  return `https://${host}`;
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = originFromRequest(req);

  if (!clientId) {
    return Response.redirect(`${origin}/login?error=google_not_configured`, 302);
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${origin}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  // Response.redirect()'s headers are immutable in this runtime — build the
  // redirect by hand so the state cookie can actually be attached to it.
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    },
  });
}

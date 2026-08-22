import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import {
  accountTooNew,
  discordConfig,
  hasClaimed,
  identitySecret,
  originFromRequest,
} from "../../_lib";

export const dynamic = "force-dynamic";

// ── The VERIFIED path, step 1 ─────────────────────────────────────────────
//
// Discord is the one platform of the four that can actually be checked. The
// OAuth2 `guilds.members.read` scope lets us ask Discord itself, first-party,
// whether the authorizing user is a member of ONE specific guild — ours. It is
// narrower than the `guilds` scope, which would hand us the full list of every
// server the user is in; we have no business seeing that, and asking for it
// would make the consent screen alarming for no gain.
//
// Nothing here is trusted from the browser. The user identity comes from the
// session cookie, the guild membership comes from Discord's API, and the two
// are tied together by a state cookie that also pins WHICH Kodely user started
// the flow — so a callback replayed into a different session cannot land.

const STATE_COOKIE = "kodely_discord_reward_state";

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);

  const config = discordConfig();
  // Unconfigured is not an error — the reward simply does not exist. The
  // settings page will not have shown a button; a hand-typed URL lands here.
  if (!config || identitySecret() === null) {
    console.error(
      "[rewards] Discord reward hit without full config (KODELY_DISCORD_CLIENT_ID / _SECRET / _GUILD_ID, KODELY_REWARDS_ID_SALT).",
    );
    return Response.redirect(`${origin}/settings?reward=unavailable`, 302);
  }

  if (await hasClaimed(user.id, "discord")) {
    return Response.redirect(`${origin}/settings?reward=already`, 302);
  }
  if (accountTooNew(user.createdAt)) {
    return Response.redirect(`${origin}/settings?reward=too_new`, 302);
  }

  // The state cookie carries the user id alongside the nonce. Both are
  // re-checked in the callback: the nonce proves the round trip started here,
  // the user id proves it started in THIS session.
  const nonce = randomBytes(24).toString("base64url");
  const state = `${nonce}.${user.id}`;

  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/rewards/discord/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "identify guilds.members.read");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  // Response.redirect()'s headers are immutable in this runtime — build the
  // redirect by hand so the state cookie can be attached (same reason the
  // Google OAuth start route does this).
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

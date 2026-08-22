import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  accountTooNew,
  discordConfig,
  grantReward,
  identityHash,
  originFromRequest,
} from "../../_lib";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

// ── The VERIFIED path, step 2 ─────────────────────────────────────────────
//
// This is the only place in the whole feature where a grant is backed by an
// actual third-party check. The claim "this person is in our Discord" is
// answered by Discord, about the account that just authenticated to Discord,
// on a server-to-server call the browser never touches.
//
// The access token is used once, here, and never stored — not in the ledger,
// not in a cookie, not in a log. The only thing that survives this request is
// an HMAC of the Discord user id (see identityHash in ../../_lib.ts).

const STATE_COOKIE = "kodely_discord_reward_state";
const API = "https://discord.com/api/v10";
/** Documented unversioned form; the resource endpoints below are pinned to v10. */
const TOKEN_URL = "https://discord.com/api/oauth2/token";

/**
 * undici applies no overall request deadline by default (only a connect and a
 * headers timeout, the latter measured in minutes), so a stalled Discord call
 * would otherwise hold this route open far longer than a user will wait. A
 * timeout here surfaces as an abort, which the catch below turns into a
 * fail-closed "try again" — never a grant.
 */
const DISCORD_TIMEOUT_MS = 10_000;

type TokenResponse = { access_token?: string; error?: string };
type DiscordUser = { id?: string };

function done(origin: string, outcome: string): Response {
  return Response.redirect(`${origin}/settings?reward=${outcome}`, 302);
}

/** Constant-time compare that tolerates unequal lengths without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const url = new URL(req.url);

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);

  const config = discordConfig();
  if (!config) {
    console.error("[rewards] Discord callback reached with no Discord config.");
    return done(origin, "unavailable");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Three things have to line up: the state came back intact, it matches the
  // cookie we set, and it names the user whose session is making this request.
  // The last check is what stops a captured callback URL from being replayed
  // into someone else's browser to move a grant onto their account.
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return done(origin, "failed");
  }
  if (state.split(".")[1] !== user.id) return done(origin, "failed");

  // Re-checked after the round trip, not just before it — the flow takes as
  // long as the user takes, and both of these can change in the meantime.
  if (accountTooNew(user.createdAt)) return done(origin, "too_new");

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/rewards/discord/callback`,
      }),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    const tokens = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokens.access_token) return done(origin, "failed");

    const auth = { Authorization: `Bearer ${tokens.access_token}` };

    const meRes = await fetch(`${API}/users/@me`, {
      headers: auth,
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    const me = (await meRes.json()) as DiscordUser;
    if (!meRes.ok || !me.id) return done(origin, "failed");

    // The verification itself. 200 means Discord returned a guild member
    // object for our guild — they are in it. 404 (Unknown Guild) means they
    // are not.
    //
    // Chosen over scanning `GET /users/@me/guilds` deliberately. That list is
    // capped at 200 per page, which is also roughly the account guild cap, so
    // a Nitro user in more than 200 servers would produce a FALSE NEGATIVE on
    // a naive single-page scan — a real user denied a real reward. It also
    // asks for a much broader consent ("see all your servers") to answer a
    // one-bit question.
    //
    // Honest limit of even this check: it is a snapshot. Nothing stops
    // join -> verify -> leave. The member object carries `joined_at` if we
    // ever want to require tenure, but a 50-credit reward does not justify
    // that friction today.
    const memberRes = await fetch(`${API}/users/@me/guilds/${config.guildId}/member`, {
      headers: auth,
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });

    if (memberRes.status === 404) return done(origin, "not_member");
    if (!memberRes.ok) {
      // Anything else — 401, 403, a 429 rate limit, a Discord outage — is an
      // INCONCLUSIVE answer, and inconclusive must never pay out. Fail closed
      // and tell the user to retry; a false negative costs a retry, a false
      // positive costs real money.
      console.error(`[rewards] Discord member check returned ${memberRes.status}`);
      return done(origin, "failed");
    }

    const hash = identityHash("discord", me.id);
    if (hash === null) {
      console.error("[rewards] KODELY_REWARDS_ID_SALT is not set — refusing to grant.");
      return done(origin, "unavailable");
    }

    // ── Kill switch ────────────────────────────────────────────────────────
    // Immediately before grantReward, the only line here that moves money.
    // Everything above is verification and stores nothing: the access token is
    // used and discarded, and `hash` only becomes durable inside grantReward.
    // So refusing at this exact point leaves no ledger row and no identity
    // record — the guarantee the flag is for.
    //
    // `unavailable` is already in the notice map in
    // components/rewards/RewardsCard.tsx and renders as "That reward isn't
    // available right now." — true, specific to rewards, and it does not claim
    // the Discord check failed (it didn't) or that they already claimed
    // (they haven't). `failed` and `not_member` would both be lies here.
    //
    // isEnabled never throws — a database it cannot read resolves to this
    // flag's declared whenUnavailable, which is false — so the fail direction
    // is the same "no grant" the surrounding catch already takes.
    if (!(await isEnabled(FLAGS.rewards, user.id))) return done(origin, "unavailable");

    const result = await grantReward(user.id, "discord", hash);
    if (result.ok) return done(origin, "discord_ok");

    switch (result.reason) {
      case "already_claimed":
        return done(origin, "already");
      // The Discord account itself has already earned this on some other
      // Kodely account. This is the check that stops one Discord login from
      // farming fifty signups, and it is the one that will actually fire.
      case "identity_already_used":
        return done(origin, "discord_taken");
      case "velocity_tripped":
        return done(origin, "paused");
      default:
        return done(origin, "unavailable");
    }
  } catch (err) {
    console.error("[rewards] Discord verification failed:", err);
    return done(origin, "failed");
  }
}

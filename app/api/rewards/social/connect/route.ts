import { getCurrentUser } from "@/lib/auth";
import {
  accountTooNew,
  hasClaimed,
  isPlatformConfigured,
  MIN_ACCOUNT_AGE_HOURS,
  pendingClaim,
  recordPending,
  UNVERIFIED_HOLD_HOURS,
} from "../../_lib";
import {
  handleAlreadySpokenFor,
  handleIdentity,
  isUnverifiedPlatform,
  normalizeHandle,
} from "../_unverified";

export const dynamic = "force-dynamic";

// Step 1 of the UNVERIFIED path — see ../_unverified.ts for what this does and
// does not prove. This endpoint grants ZERO credits. It only records that the
// user claimed a handle, starting the hold clock.

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    platform?: unknown;
    handle?: unknown;
  } | null;

  const platform = body?.platform;
  if (!isUnverifiedPlatform(platform)) {
    // "discord" lands here too, and should: it has its own verified route and
    // must never be claimable by typing a handle.
    return Response.json({ error: "Unknown reward." }, { status: 400 });
  }
  if (!isPlatformConfigured(platform)) {
    return Response.json({ error: "That reward isn't available." }, { status: 404 });
  }

  if (accountTooNew(user.createdAt)) {
    return Response.json(
      {
        error: `Rewards unlock ${MIN_ACCOUNT_AGE_HOURS} hours after signup. Come back tomorrow.`,
      },
      { status: 403 },
    );
  }

  if (typeof body?.handle !== "string") {
    return Response.json({ error: "Enter your username." }, { status: 400 });
  }
  const handle = normalizeHandle(platform, body.handle);
  if (handle === null) {
    return Response.json({ error: "That doesn't look like a valid username." }, { status: 400 });
  }

  if (await hasClaimed(user.id, platform)) {
    return Response.json({ error: "You've already claimed this one." }, { status: 409 });
  }
  if (await pendingClaim(user.id, platform)) {
    return Response.json(
      { error: "You've already connected an account for this reward." },
      { status: 409 },
    );
  }

  const hash = handleIdentity(platform, handle);
  if (hash === null) {
    console.error("[rewards] KODELY_REWARDS_ID_SALT is not set — refusing to record a claim.");
    return Response.json({ error: "Rewards are unavailable right now." }, { status: 503 });
  }

  // One external identity, one grant, across every Kodely account. Checked
  // here for a clean error message, and again inside recordPending's lock —
  // this one is advisory, that one is authoritative.
  if (await handleAlreadySpokenFor(platform, hash)) {
    return Response.json(
      { error: "That account has already been used for this reward." },
      { status: 409 },
    );
  }

  const result = await recordPending(user.id, platform, hash);
  if (!result.ok) {
    return Response.json(
      {
        error:
          result.reason === "identity_already_used"
            ? "That account has already been used for this reward."
            : "You've already started this one.",
      },
      { status: 409 },
    );
  }

  const readyAt = new Date(Date.now() + UNVERIFIED_HOLD_HOURS * 3_600_000);
  return Response.json({ state: "pending", readyAt: readyAt.toISOString() });
}

import { getCurrentUser } from "@/lib/auth";
import {
  accountTooNew,
  grantReward,
  hashFromPendingReason,
  isPlatformConfigured,
  MIN_ACCOUNT_AGE_HOURS,
  pendingClaim,
  UNVERIFIED_HOLD_HOURS,
} from "../../_lib";
import { isUnverifiedPlatform } from "../_unverified";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

// Step 2 of the UNVERIFIED path — see ../_unverified.ts. This DOES move money,
// so every gate is re-checked here rather than trusted from step 1: the hold
// is recomputed from the pending row's own createdAt (not from anything the
// client sends), and the identity hash comes out of the stored reason string
// rather than being re-derived from a handle the client could swap.

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { platform?: unknown } | null;
  const platform = body?.platform;

  if (!isUnverifiedPlatform(platform)) {
    return Response.json({ error: "Unknown reward." }, { status: 400 });
  }
  if (!isPlatformConfigured(platform)) {
    return Response.json({ error: "That reward isn't available." }, { status: 404 });
  }
  if (accountTooNew(user.createdAt)) {
    return Response.json(
      { error: `Rewards unlock ${MIN_ACCOUNT_AGE_HOURS} hours after signup.` },
      { status: 403 },
    );
  }

  const pending = await pendingClaim(user.id, platform);
  if (!pending) {
    return Response.json({ error: "Connect an account first." }, { status: 409 });
  }

  const readyAt = pending.createdAt.getTime() + UNVERIFIED_HOLD_HOURS * 3_600_000;
  if (Date.now() < readyAt) {
    return Response.json(
      { error: "Not ready yet.", readyAt: new Date(readyAt).toISOString() },
      { status: 425 },
    );
  }

  const hash = hashFromPendingReason(pending.reason);
  if (hash === null) {
    console.error(`[rewards] malformed pending reason for user ${user.id}: ${pending.reason}`);
    return Response.json({ error: "Rewards are unavailable right now." }, { status: 503 });
  }

  // ── Kill switch ──────────────────────────────────────────────────────────
  // Immediately before grantReward, which is the only line in this file that
  // moves money: it writes the CreditLedger row (see app/api/rewards/_lib.ts).
  // Every check above it is a read — the pending claim, the hold window, the
  // identity hash — so refusing here leaves the pending row exactly as it was
  // and no ledger entry at all. This is the last position from which the switch
  // can still guarantee "nothing was granted", which is the whole reason the
  // flag exists.
  //
  // 503 matches the malformed-pending-reason branch just above, the other
  // "we can't do this right now, and it isn't your fault" answer on this route.
  // Subject: user.id, so a rolloutPct below 100 would be a stable per-user
  // split rather than a total shed.
  if (!(await isEnabled(FLAGS.rewards, user.id))) {
    return Response.json(
      {
        error:
          "Reward claims are paused right now. Nothing has been credited and your connected account is still saved — try claiming again later.",
      },
      { status: 503 },
    );
  }

  const result = await grantReward(user.id, platform, hash);
  if (!result.ok) {
    const status =
      result.reason === "already_claimed" || result.reason === "identity_already_used"
        ? 409
        : result.reason === "velocity_tripped"
          ? 429
          : 503;
    return Response.json({ error: messageFor(result.reason), state: result.reason }, { status });
  }

  return Response.json({ state: "claimed", credits: result.credits });
}

function messageFor(reason: string): string {
  switch (reason) {
    case "already_claimed":
      return "You've already claimed this one.";
    case "identity_already_used":
      return "That account has already been used for this reward.";
    case "velocity_tripped":
      return "Reward claims are paused for a moment. Try again shortly.";
    default:
      return "Rewards are unavailable right now.";
  }
}

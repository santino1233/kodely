import { db } from "@/lib/db";
import {
  grantReason,
  identityHash,
  isPlatformConfigured,
  pendingReason,
  type Platform,
} from "../_lib";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  READ THIS BEFORE TOUCHING ANYTHING IN ./social                          ║
// ║                                                                          ║
// ║  THIS PATH DOES NOT VERIFY ANYTHING. It is not a weaker version of the   ║
// ║  Discord check; it is a different kind of thing wearing the same UI.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// WHY IT IS UNVERIFIED (checked against the platforms' own docs, 2026-08)
//
// None of the three expose an API that answers "does this signed-in person
// follow our account?".
//
//   - INSTAGRAM. The Basic Display API was shut off 2024-12-04, and Meta
//     stated at the same time that there is no longer an Instagram API group
//     for consumer-facing apps — which is exactly what our users have. The
//     surviving Instagram-Login / Graph permissions authenticate BUSINESS and
//     creator accounts and carry no follow graph: the IG User node exposes
//     `followers_count` as an integer with no `follows`/`followed_by` edge,
//     and Business Discovery returns another account's public counts, never
//     who is in them. The one field that would answer this,
//     `is_user_follow_business`, lives in the Messaging User Profile API and
//     is keyed on a conversation id — it only works for someone who has
//     already DM'd us, so it cannot be pointed at a web visitor.
//
//   - FACEBOOK. `GET /{user-id}/likes?target_id={page-id}` does still exist,
//     but it needs the `user_likes` permission, whose App Review "allowed
//     usage" is enumerated (interest-based personalisation, under-18 parental
//     monitoring) and does not include incentives — a truthful submission
//     should be expected to fail. Two further problems: Pages under the New
//     Page Experience report Followers rather than Likes, and the edge has
//     always been privacy-setting dependent, so it produces false negatives
//     even when granted. SEE THE POLICY WARNING BELOW — Facebook is not just
//     unverifiable, it is the one platform here whose terms appear to
//     prohibit the feature outright.
//
//   - LINKEDIN. No follower-membership API at any access tier. Sign In with
//     LinkedIn (OIDC) offers only `openid`/`profile`/`email` and returns
//     identity claims — nothing about follows. Follower reporting is
//     aggregate-only: organizationalEntityFollowerStatistics buckets counts
//     by demographic facet and requires page-admin auth, and networkSizes
//     with COMPANY_FOLLOWED_BY_MEMBER returns a single total despite the
//     tempting name.
//
// So there is no honest way to check. What is implemented instead is a
// SELF-DECLARATION with a HOLD:
//
//   1. The user says which account is theirs (a handle we normalise).
//   2. We write a delta-0 pending row. NOTHING IS GRANTED AT THIS POINT.
//   3. After UNVERIFIED_HOLD_HOURS, the user can claim the 50 credits.
//
// WHAT THE ABUSE EXPOSURE ACTUALLY IS — stated plainly, not softened:
//
//   - Anyone can type any handle. They do not have to own it, and they do not
//     have to have followed us. Typing "@someone_else" works.
//   - The only real defence is the one-grant-per-identity-hash rule, and here
//     the "identity" is a self-declared string. It stops handle REUSE. It does
//     not stop handle INVENTION: 50 accounts each typing a different made-up
//     handle each get 50 credits, at a real cost of ~$0.10 per account.
//   - The hold is not verification. It buys a window in which a burst is
//     visible and cancellable (delete the pending rows), plus the global
//     velocity breaker in ../_lib.ts. That is damage control, not prevention.
//
// The honest containment is therefore: the 24h account-age gate, the velocity
// breaker, the 72h hold, and the fact that the total exposure per fake account
// is capped at 150 credits (~$0.30) across these three. If that exposure ever
// stops being acceptable, DELETE THIS DIRECTORY — do not try to make the check
// look stronger than it is.
//
// ── POLICY WARNING: FACEBOOK ──────────────────────────────────────────────
//
// Everything above is about whether the check WORKS. Facebook has a separate
// problem: whether we are allowed to do it at all.
//
// Meta's developer incentivization policy enumerates what an app may reward —
// logging in with Facebook, checking in at a location, referral rewards for
// game installs — and expressly says not to incentivize people to post content
// or to Like a Page, or to give the impression that doing so will be rewarded.
// "Like our Facebook page for 50 credits" is a close paraphrase of the
// prohibited example. Facebook's Pages, Groups and Events Policies point the
// same way for promotions run by a Page.
//
// A reading in our favour exists — those are developer-platform terms, and
// this flow touches no Meta API — but it is a reading, and the downside is our
// Page or Meta business account being actioned.
//
// So this code does NOT decide. The Facebook reward is inert unless someone
// sets KODELY_FACEBOOK_URL (see isPlatformConfigured in ../_lib.ts). Do not
// set it until a human has read Meta's incentivization policy in a browser and
// decided deliberately. Instagram sits under the same Meta umbrella and the
// same caution should be applied before enabling it.

/** These three, and never "discord". A compile-time wall between the paths. */
export type UnverifiedPlatform = Exclude<Platform, "discord">;

export function isUnverifiedPlatform(value: unknown): value is UnverifiedPlatform {
  return value === "instagram" || value === "facebook" || value === "linkedin";
}

/**
 * Normalising is the one thing here that does real work. It collapses the
 * obvious ways the same account can be typed differently — "@Foo",
 * "instagram.com/foo/", "https://www.instagram.com/foo?hl=en" — into one
 * string, so the one-grant-per-identity rule cannot be sidestepped by
 * reformatting. It is NOT validation of ownership.
 */
export function normalizeHandle(platform: UnverifiedPlatform, raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 300) return null;

  // A pasted profile URL: keep the last meaningful path segment.
  if (value.includes("/")) {
    value = value.split(/[?#]/)[0].replace(/^[a-z]+:\/\//, "");
    const segments = value.split("/").filter((s) => s.length > 0);
    // Drop the hostname — but only when it is the FIRST segment. Testing for a
    // dot anywhere would also throw away "kodely.app", which is a perfectly
    // legal Facebook username.
    if (segments[0]?.includes(".")) segments.shift();
    // LinkedIn profile and company URLs carry a type segment ("in", "company").
    const meaningful = segments.filter((s) => s !== "in" && s !== "company" && s !== "pages");
    value = meaningful[meaningful.length - 1] ?? "";
  }

  value = value.replace(/^@+/, "");
  if (value.length === 0) return null;

  const shapes: Record<UnverifiedPlatform, RegExp> = {
    // Instagram: letters, digits, periods, underscores, max 30.
    instagram: /^[a-z0-9._]{1,30}$/,
    // Facebook: usernames are letters, digits and periods; numeric ids also appear.
    facebook: /^[a-z0-9.]{4,50}$/,
    // LinkedIn public profile vanity slugs allow hyphens.
    linkedin: /^[a-z0-9-]{3,100}$/,
  };

  return shapes[platform].test(value) ? value : null;
}

/**
 * True if this self-declared handle is already spoken for ANYWHERE — granted
 * on some account, or pending on some account. Checked across every user, not
 * just this one: the point is that one external identity earns one grant in
 * total, not one grant per Kodely signup.
 *
 * Pending rows count. Otherwise fifty accounts could all pend the same handle
 * and only discover the clash at claim time, which turns a clean refusal into
 * fifty confused support tickets.
 */
export async function handleAlreadySpokenFor(
  platform: UnverifiedPlatform,
  hash: string,
): Promise<boolean> {
  const row = await db.creditLedger.findFirst({
    where: { reason: { in: [grantReason(platform, hash), pendingReason(platform, hash)] } },
    select: { id: true },
  });
  return row !== null;
}

/** Hash for a self-declared handle, or null when rewards are unkeyed/unconfigured. */
export function handleIdentity(
  platform: UnverifiedPlatform,
  handle: string,
): string | null {
  if (!isPlatformConfigured(platform)) return null;
  return identityHash(platform, handle);
}

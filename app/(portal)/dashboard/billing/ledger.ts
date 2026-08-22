import { PLATFORM_LABELS } from "@/app/api/rewards/_lib";

// Presentation helpers for the customer's own credit statement.
//
// The admin equivalent (app/admin/users/ui.tsx `reasonLabel`) decodes the same
// strings, but it is allowed to fall back to echoing the raw `reason` and to
// expose it on hover. This one is not. `CreditLedger.reason` is free text that
// carries a Stripe Checkout session id and an HMAC of a customer's external
// social account (see app/api/rewards/_lib.ts), and neither of those belongs in
// front of the person they are about. So every branch here returns wording we
// wrote, and the unknown branch returns wording too — it never passes the
// string through.

export type ReasonDescription = {
  /** Plain-English label for the "What" column. */
  label: string;
  /** Optional second line. Never contains an id, session or hash. */
  detail?: string;
};

/**
 * Decode one ledger `reason` into something a customer can read.
 *
 * The four shapes that exist today, all written by our own code:
 *   "build"                                     a charge for a successful build
 *   "signup_grant"                              the free credits at signup
 *   "stripe:<checkout session id>"              a paid top-up (webhook only)
 *   "reward:<platform>:<hash>"                  a granted social reward
 *   "reward:<platform>:pending:<hash>"          a claim on hold, delta 0
 */
export function describeReason(reason: string, delta: number): ReasonDescription {
  if (reason === "build") {
    return { label: "Site build" };
  }

  if (reason === "signup_grant") {
    return { label: "Welcome credits", detail: "Added free when you created your account" };
  }

  if (reason.startsWith("stripe:")) {
    // Everything after the prefix is the Stripe Checkout session id. It
    // identifies a payment session, is meaningless to the customer, and stops
    // here. The pack size is already visible in the Change column.
    return { label: "Credit purchase", detail: "Paid top-up" };
  }

  if (reason.startsWith("reward:")) {
    const parts = reason.split(":");
    // Platform name only — the trailing segment is a keyed hash of the external
    // account and is never rendered.
    const name = (PLATFORM_LABELS as Record<string, string | undefined>)[parts[1] ?? ""] ?? "Social";

    if (parts[2] === "pending") {
      // A zero-delta row: the claim is recorded but nothing has moved yet.
      return {
        label: `${name} reward — on hold`,
        detail: "Recorded. The credits are added once the hold period is up.",
      };
    }
    return { label: `${name} reward` };
  }

  // Unrecognised shape. `reason` is free text on an append-only table, so it
  // could be anything — including something with an id in it. Describe it from
  // the direction of the money instead of echoing it.
  if (delta > 0) return { label: "Credits added" };
  if (delta < 0) return { label: "Credits used" };
  return { label: "Account note" };
}

// Fixed to UTC so the string is the same on every render and does not depend on
// the server's timezone. Rendered server-side only, so there is no client clock
// to disagree with it.
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatDay(d: Date): string {
  return DAY.format(d);
}

export function formatTime(d: Date): string {
  return TIME.format(d);
}

/** "+750" / "-472" / "0" — the sign is the whole point of a statement column. */
export function signedCredits(delta: number): string {
  return delta > 0 ? `+${delta.toLocaleString("en-GB")}` : delta.toLocaleString("en-GB");
}

export function formatCredits(n: number): string {
  return n.toLocaleString("en-GB");
}

// RETAIL ONLY. This formats CreditPack.priceUsdCents — the published price of a
// pack, which the customer is about to be charged and which already appears in
// CreditPack.label. It must never be pointed at Build.costMicros: that figure
// is our underlying model spend, i.e. the cost basis behind those prices (see
// the margin table in lib/stripe.ts), and it is not the customer's business.
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatUsdCents(cents: number): string {
  return USD.format(cents / 100);
}

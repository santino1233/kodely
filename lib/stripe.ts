import Stripe from "stripe";

// ── Money-path safety rules for this file ──────────────────────────────────
// 1. Credit packs are a fixed server-side table, keyed by an opaque pack id.
//    A client can only ever say WHICH pack it wants — never an amount, a
//    price, or a credit count. This is the same class of bug that hit Nxeon's
//    hosting checkout (displayed price != charged price); the fix there was
//    "never trust a client-supplied number", and it applies here identically.
// 2. Credits are granted ONLY from the webhook, after Stripe confirms payment
//    — never from the client-side checkout-success redirect, which a user can
//    hit or forge without ever having paid.
// 3. Every webhook event is idempotency-guarded via StripeEvent (see schema)
//    — Stripe retries on any non-2xx, so this must be safe to receive twice.

export type CreditPack = {
  id: string;
  credits: number;
  priceUsdCents: number;
  label: string;
};

// Retail prices. Comment corrected 2026-08-22 — the previous version read
// "$1 = 500 credits list price ... packs get a modest discount at volume",
// which conflated COST with PRICE. Read literally it claimed the starter pack
// was a discount on $1 when it sells for $9, and anyone using it to reason
// about margin would have been badly wrong in both directions.
//
// What MICROS_PER_CREDIT fixes is the COST BASIS: 500 credits = $1.00 of
// underlying model spend (500 x 2000 micros). It is not a price anyone pays.
//
// Actual retail, with gross margin against that basis:
//   starter   500 credits   $9    $0.0180/credit   cost $1.00    88.9%
//   builder  2500 credits   $40   $0.0160/credit   cost $5.00    87.5%
//   pro      6000 credits   $90   $0.0150/credit   cost $12.00   86.7%
//
// The volume discount is real, but it is per-credit against the STARTER PACK
// (1.80c -> 1.60c -> 1.50c), not against the cost basis. Margin drifts down
// slightly as the discount deepens, which is the intended shape.
//
// Caveat: those margins hold only if the cost basis does. Measured builds have
// come in at 144 and 472 credits, so a $9 starter pack is somewhere between
// one and three builds. Do not publish a per-build price anywhere until
// scripts/eval has run a full sweep — see estimateCredits in lib/credits.ts.
export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", credits: 500, priceUsdCents: 900, label: "500 credits — $9" },
  { id: "builder", credits: 2500, priceUsdCents: 4000, label: "2,500 credits — $40" },
  { id: "pro", credits: 6000, priceUsdCents: 9000, label: "6,000 credits — $90" },
];

export function getPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

/** True once real Stripe keys are configured. Billing UI/routes degrade gracefully until then. */
export function billingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY unset).");
  }
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

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

// $1 = 500 credits list price (matches MICROS_PER_CREDIT in lib/credits.ts —
// 500 credits * 2000 micros = $1.00), packs get a modest discount at volume.
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

import { db } from "@/lib/db";
import { billingEnabled, getPack, stripe } from "@/lib/stripe";
import { grantCredits } from "@/lib/credits";
import { track, EVENTS } from "@/lib/events";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// The ONLY place credits are ever granted for a purchase. Never trust the
// client-side success redirect — a user can hit that URL without paying.
// Every event is idempotency-guarded via StripeEvent so a Stripe retry
// (fires on any non-2xx response) can never double-grant credits.
export async function POST(req: Request) {
  if (!billingEnabled()) return new Response("Billing not configured.", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[kodely] stripe webhook signature verification failed", err);
    return new Response("Invalid signature.", { status: 400 });
  }

  // Claim the event FIRST, before granting anything. `id` is unique, so a
  // concurrent or retried delivery hits a P2002 conflict here and we skip —
  // this is the actual dedupe mutex. Claiming before granting (not after)
  // matters: if we crash between grant and claim, a retry would grant twice.
  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return Response.json({ ok: true, deduped: true });
    throw err;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      const userId = session.metadata?.kodelyUserId;
      const packId = session.metadata?.packId;
      const pack = packId ? getPack(packId) : undefined;

      // Re-derive the credit amount from the fixed pack table rather than
      // trusting the metadata's echoed `credits` string — metadata is
      // attacker-writable in principle if the integration ever changes.
      if (userId && pack) {
        await grantCredits(userId, pack.credits, `stripe:${session.id}`);
        // Fires only after the grant lands, so the event can never claim a
        // purchase the ledger doesn't show. The StripeEvent idempotency guard
        // above means a webhook retry won't double-count this either.
        track(EVENTS.creditsPurchased, {
          userId,
          props: { packId: pack.id, credits: pack.credits, priceUsdCents: pack.priceUsdCents },
        });
      } else {
        console.error("[kodely] stripe webhook: missing/invalid metadata", session.id);
      }
    }
  }

  return Response.json({ ok: true });
}

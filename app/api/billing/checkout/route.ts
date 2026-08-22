import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { billingEnabled, getPack, stripe } from "@/lib/stripe";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://kodely.me";

export async function POST(req: Request) {
  if (!billingEnabled()) {
    return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });
  }

  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { packId?: string } | null;
  // The ONLY thing the client controls is which pack it wants. Credits and
  // price are always resolved server-side from CREDIT_PACKS — see lib/stripe.ts.
  const pack = getPack(body?.packId ?? "");
  if (!pack) return Response.json({ error: "Unknown credit pack." }, { status: 400 });

  const client = stripe();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      email: user.email,
      metadata: { kodelyUserId: user.id },
    });
    customerId = customer.id;
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await client.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    // The webhook is the only place credits are ever granted — this metadata
    // is what tells it how much to grant and to whom.
    metadata: { kodelyUserId: user.id, packId: pack.id, credits: String(pack.credits) },
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.priceUsdCents,
          product_data: { name: `Kodely — ${pack.label}` },
        },
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/dashboard?topup=success`,
    cancel_url: `${APP_URL}/dashboard?topup=cancelled`,
  });

  // Started, not completed. Paired with credits.purchased in the webhook, this
  // is what makes checkout abandonment visible — the gap between the two is
  // the number that matters.
  track(EVENTS.checkoutStarted, {
    userId: user.id,
    props: { packId: pack.id, credits: pack.credits, priceUsdCents: pack.priceUsdCents },
  });

  return Response.json({ url: session.url });
}

import { requireUser } from "@/lib/auth";
import { nxeonCheckoutUrl, nxeonEnabled, type NxeonProduct } from "@/lib/nxeon";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const PRODUCTS: readonly NxeonProduct[] = ["domain", "vps", "hosting"];

function isProduct(value: unknown): value is NxeonProduct {
  return typeof value === "string" && (PRODUCTS as readonly string[]).includes(value);
}

/**
 * Start a Nxeon purchase. Mirrors app/api/billing/checkout/route.ts exactly:
 * POST from a client component, get back { url }, redirect the browser there.
 * The wizard the customer lands in is Nxeon's real one, already signed in —
 * Kodely never sees a card number or a domain price beyond the one shown for
 * confirmation on the Domains page.
 */
export async function POST(req: Request) {
  if (!nxeonEnabled()) {
    return Response.json({ error: "This isn't set up yet." }, { status: 503 });
  }

  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  if (!user.nxeonUserId) {
    // The client button is server-computed to hide this case (it sends people
    // to /api/nxeon/connect instead of here when unlinked) — this branch only
    // catches a stale page or a direct hand-typed request.
    return Response.json({ error: "Connect your Nxeon account first." }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { product?: string; domain?: string } | null;
  const rawProduct = body?.product;
  if (!isProduct(rawProduct)) {
    return Response.json({ error: "Unknown product." }, { status: 400 });
  }
  const product: NxeonProduct = rawProduct;
  // A domain is user-typed on the way in; Nxeon's own checkout page is the
  // place it gets validated and priced for real, so this only needs a shape
  // that cannot be a header-injection or absurd-length payload.
  const domain =
    product === "domain" && typeof body?.domain === "string" && body.domain.length <= 253
      ? body.domain.trim().toLowerCase()
      : undefined;

  try {
    const { url } = await nxeonCheckoutUrl(user.nxeonUserId, product, domain);
    track(EVENTS.nxeonCheckoutStarted, { userId: user.id, props: { product } });
    return Response.json({ url });
  } catch (err) {
    console.error("[nxeon] checkout failed", err);
    return Response.json({ error: "Couldn't start checkout with Nxeon." }, { status: 502 });
  }
}

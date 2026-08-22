import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { nxeonEnabled } from "@/lib/nxeon";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Receives Nxeon's provision-complete callbacks. Only fires for orders placed
 * through OUR checkout link — never for Nxeon's other customers.
 *
 * IDEMPOTENCY, which the reference integration kit did not include: the HMAC
 * signature proves the request came from Nxeon; it says nothing about whether
 * this exact delivery has already been applied. A retry (Nxeon's or a replay)
 * must not double-write. NxeonEvent is the same claim-before-act mutex
 * StripeEvent already provides — claimed BEFORE the write, not after, so a
 * crash between claim and write fails toward "not yet handled" rather than a
 * silent double-apply on the next retry.
 *
 * THE DEDUPE KEY, and why it is not just `payload.id`: the kit's documented
 * event shape is `{ event, payload }` — no event id anywhere. Requiring one
 * would refuse 100% of real deliveries, which is a worse failure than no
 * idempotency at all. So the key is `id` IF Nxeon ever adds one, falling back
 * to a hash of the exact request body otherwise. A byte-identical retry hashes
 * to the same key and is caught; two DIFFERENT real events happening to hash
 * the same is not a realistic risk at this volume. Revisit this the moment
 * Nxeon's docs promise a real event id — that is strictly better and this
 * comment is the marker to go find and simplify it.
 */
export async function POST(req: Request) {
  if (!nxeonEnabled()) return new Response("Not configured.", { status: 503 });

  const signature = req.headers.get("x-nxeon-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  const raw = await req.text();
  const expected = createHmac("sha256", process.env.NXEON_WEBHOOK_SECRET!)
    .update(raw)
    .digest("base64url");

  // timingSafeEqual throws on unequal-length buffers rather than returning
  // false, so length is checked first — same guard as the Discord reward
  // callback's safeEqual().
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Invalid signature.", { status: 401 });
  }

  let parsed: { id?: string; event?: string; payload?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response("Malformed body.", { status: 400 });
  }

  const { event, payload } = parsed;
  const dedupeKey =
    typeof parsed.id === "string" && parsed.id.length > 0
      ? parsed.id
      : `body:${createHash("sha256").update(raw).digest("hex")}`;

  try {
    await db.nxeonEvent.create({ data: { id: dedupeKey, type: event ?? "unknown" } });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return Response.json({ ok: true, deduped: true });
    throw err;
  }

  const nxeonUserId = String(payload?.userId ?? "");
  if (!nxeonUserId) return new Response("ok");

  // Resolved once and reused, so the tracked event carries the real Kodely
  // user id rather than nothing — an orphaned event with no userId is
  // invisible to every per-user query (the activation funnel, the admin
  // per-customer timeline), which is the whole reason Event.userId exists.
  const owner = await db.user.findUnique({ where: { nxeonUserId }, select: { id: true } });

  switch (event) {
    case "vps.provisioned": {
      // payload: { userId, serverId, hostname, ipAddress }
      const result = await db.user.updateMany({
        where: { nxeonUserId },
        data: {
          nxeonServerId: orNull(payload?.serverId),
          nxeonServerIp: orNull(payload?.ipAddress),
          nxeonServerHostname: orNull(payload?.hostname),
        },
      });
      if (result.count > 0) {
        track(EVENTS.nxeonOrderCompleted, { userId: owner?.id, props: { product: "vps" } });
      }
      break;
    }
    case "domain.registered": {
      // payload: { userId, domain, expiresAt }
      const expiresAt = parseDate(payload?.expiresAt);
      const result = await db.user.updateMany({
        where: { nxeonUserId },
        data: {
          nxeonDomain: orNull(payload?.domain),
          nxeonDomainExpiresAt: expiresAt,
        },
      });
      if (result.count > 0) {
        track(EVENTS.nxeonOrderCompleted, { userId: owner?.id, props: { product: "domain" } });
      }
      break;
    }
    case "hosting.provisioned": {
      // payload: { userId, accountId, domain }
      const result = await db.user.updateMany({
        where: { nxeonUserId },
        data: {
          nxeonHostingAccountId: orNull(payload?.accountId),
          nxeonHostingDomain: orNull(payload?.domain),
        },
      });
      if (result.count > 0) {
        track(EVENTS.nxeonOrderCompleted, { userId: owner?.id, props: { product: "hosting" } });
      }
      break;
    }
    default:
      break; // unknown event — ignore, don't error (forward compatible)
  }

  return new Response("ok");
}

function orNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

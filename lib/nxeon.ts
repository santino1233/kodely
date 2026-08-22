/**
 * Server-to-server client for Nxeon (domains / VPS / shared hosting), shared
 * behind one Nxeon wallet with a Kodely account.
 *
 * Gated the same way lib/stripe.ts gates billing: `nxeonEnabled()` is false
 * until every env var is set, and every caller checks it before touching a
 * live route — a half-configured integration must read as absent, not throw
 * halfway through a customer's click.
 *
 * WHAT THIS DOES NOT COVER: linking an account, buying a domain, or
 * provisioning a VPS/hosting account does not, on its own, put a Kodely site
 * on that infrastructure. Nxeon's API surface here is identity + billing +
 * provisioning notification. Deploying generated files onto a Nxeon server is
 * a separate, unbuilt piece of work — see the note on User.nxeonServerId in
 * prisma/schema.prisma.
 *
 * SERVER ONLY, same convention as lib/stripe.ts and lib/credits.ts: no build
 * step enforces this (the `server-only` package is not a dependency here),
 * so it is enforced by discipline — never import this from a "use client"
 * file. NXEON_PARTNER_KEY reaching a client bundle is a live credential leak.
 */

export type NxeonProduct = "domain" | "vps" | "hosting";

export function nxeonEnabled(): boolean {
  return (
    !!process.env.NXEON_BASE_URL &&
    !!process.env.NXEON_PARTNER_KEY &&
    !!process.env.NXEON_WEBHOOK_SECRET &&
    !!process.env.NXEON_REDIRECT_URI
  );
}

function base(): string {
  return (process.env.NXEON_BASE_URL ?? "https://nxeon.cloud").replace(/\/+$/, "");
}

class NxeonApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One JSON POST to Nxeon's partner API, authenticated with the partner key.
 * Never called unless `nxeonEnabled()` is true — callers are responsible for
 * that check, because the alternative (checking here and throwing) would turn
 * "not configured" and "Nxeon is down" into the same exception.
 */
async function partner<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.NXEON_PARTNER_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    // The body may carry Nxeon's own error detail; it is never shown to the
    // customer verbatim (see the callers below), only logged.
    const detail = await res.text().catch(() => "");
    throw new NxeonApiError(path, res.status, detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type NxeonIdentity = {
  userId: string;
  email: string;
  name: string;
  balanceCents: number;
};

/** Where to send the browser to link (and log into) a Nxeon account. `state`
    is a CSRF nonce the caller must verify on the way back — see
    app/api/nxeon/connect and .../callback. */
export function nxeonAuthorizeUrl(state: string): string {
  const u = new URL(`${base()}/sso/authorize`);
  u.searchParams.set("client_id", "kodely");
  u.searchParams.set("redirect_uri", process.env.NXEON_REDIRECT_URI!);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Exchange the code from /sso/authorize for the linked Nxeon identity. */
export function exchangeSsoCode(code: string): Promise<NxeonIdentity> {
  return partner<NxeonIdentity>("/api/partner/sso/token", {
    code,
    redirect_uri: process.env.NXEON_REDIRECT_URI,
  });
}

/** Shared wallet balance for an already-linked Nxeon user. */
export function nxeonWallet(nxeonUserId: string): Promise<{ balanceCents: number }> {
  return partner("/api/partner/wallet", { userId: nxeonUserId });
}

export type NxeonDomainCheck = {
  domain: string;
  available: boolean;
  premium: boolean;
  priceCents: number | null;
  renewCents: number | null;
};

/** Live availability + retail price. Nxeon caps this at 20 domains per call;
    that cap is enforced here so a caller's bug fails loudly, not at Nxeon. */
export async function nxeonCheckDomains(domains: string[]): Promise<NxeonDomainCheck[]> {
  if (domains.length === 0) return [];
  if (domains.length > 20) throw new Error("nxeonCheckDomains: 20 domains max per call.");
  const { results } = await partner<{ results: NxeonDomainCheck[] }>(
    "/api/partner/domains/check",
    { domains },
  );
  return results;
}

/** A pre-filled Nxeon checkout URL — redirect the browser here to buy.
    `domain` is only meaningful for product "domain". */
export function nxeonCheckoutUrl(
  nxeonUserId: string,
  product: NxeonProduct,
  domain?: string,
): Promise<{ url: string }> {
  return partner("/api/partner/checkout", { userId: nxeonUserId, product, domain });
}

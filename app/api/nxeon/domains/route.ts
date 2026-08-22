import { requireUser } from "@/lib/auth";
import { nxeonCheckDomains, nxeonEnabled } from "@/lib/nxeon";

export const dynamic = "force-dynamic";

// A conservative shape check before it ever reaches Nxeon: something that at
// least looks like a hostname, bounded well under the 253-byte DNS ceiling.
// Nxeon's own check is the real validator; this only stops obvious junk from
// spending a partner-API call.
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Live availability + retail price while a customer types a domain into the
 * Domains page. Read-only, no purchase happens here — see
 * app/api/nxeon/checkout for that.
 */
export async function GET(req: Request) {
  if (!nxeonEnabled()) return Response.json({ error: "This isn't set up yet." }, { status: 503 });

  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const domain = new URL(req.url).searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (!DOMAIN_RE.test(domain) || domain.length > 253) {
    return Response.json({ error: "That doesn't look like a domain." }, { status: 400 });
  }

  try {
    const [result] = await nxeonCheckDomains([domain]);
    return Response.json({ result: result ?? null });
  } catch (err) {
    console.error("[nxeon] domain check failed", err);
    return Response.json({ error: "Couldn't check that domain right now." }, { status: 502 });
  }
}

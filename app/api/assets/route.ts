import { requireUser } from "@/lib/auth";
import {
  ASSET_KINDS,
  assetCatalogSummary,
  findAssets,
  getAsset,
  type AssetKind,
} from "@/lib/assets";

export const dynamic = "force-dynamic";

const MAX_QUERY_CHARS = 120;

/**
 * The asset library over HTTP, for a future asset-picker UI in the editor.
 *
 *   GET /api/assets                  -> catalogue summary (what's in here)
 *   GET /api/assets?q=coffee         -> matches across every kind
 *   GET /api/assets?q=phone&kind=icon&limit=12
 *   GET /api/assets?kind=gradient    -> browse one kind
 *   GET /api/assets?id=icon:phone    -> one asset by its stable id
 *
 * Auth-gated the same way as app/api/projects/route.ts. There is nothing
 * secret in here — the data is static and hand-authored — but it is our
 * content, the payload is large enough to be worth not serving anonymously,
 * and every other route under app/api that isn't auth/health/webhook is gated.
 * Nothing here reads or writes the database or costs credits.
 */
export async function GET(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  const q = url.searchParams.get("q")?.trim() ?? "";
  const kindParam = url.searchParams.get("kind")?.trim().toLowerCase();
  const limitParam = url.searchParams.get("limit");
  const weightParam = url.searchParams.get("weight")?.trim().toLowerCase();

  if (q.length > MAX_QUERY_CHARS) {
    return Response.json({ error: "Search term is too long." }, { status: 400 });
  }

  // A comma list lets the picker ask for, say, "gradient,mesh" in one call.
  let kind: AssetKind[] | undefined;
  if (kindParam) {
    const requested = kindParam.split(",").map((k) => k.trim());
    const unknown = requested.filter((k) => !ASSET_KINDS.includes(k as AssetKind));
    if (unknown.length > 0) {
      return Response.json(
        { error: `Unknown kind: ${unknown.join(", ")}. Valid kinds: ${ASSET_KINDS.join(", ")}.` },
        { status: 400 },
      );
    }
    kind = requested as AssetKind[];
  }

  const weight = weightParam === "light" || weightParam === "bold" ? weightParam : "regular";

  const parsedLimit = limitParam === null ? NaN : Number(limitParam);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100) : 24;

  if (id) {
    const asset = getAsset(id, { weight });
    if (!asset) return Response.json({ error: `No asset with id "${id}".` }, { status: 404 });
    return Response.json({ asset });
  }

  // No query and no kind filter: describe the catalogue rather than dumping
  // several hundred rendered assets at a picker that only wanted to know what
  // exists.
  if (!q && !kind) {
    return Response.json({ summary: assetCatalogSummary(), kinds: ASSET_KINDS });
  }

  const assets = findAssets(q, { kind, limit, weight });
  return Response.json({ query: q, kind: kind ?? null, count: assets.length, assets });
}

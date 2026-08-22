import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

// Thumbs up/down on a finished build. Feeds the learning loop — see
// buildRatings() in lib/events.ts.
//
// Costs no credits and creates no build row: asking someone what they think of
// what they already paid for must never itself cost them anything.

const RATINGS = new Set(["up", "down"]);

/** Optional structured "what was wrong" — kept closed so it stays aggregatable. */
const REASONS = new Set([
  "looks-generic",
  "wrong-content",
  "layout-off",
  "missing-something",
  "broken",
  "other",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    buildId?: string;
    rating?: string;
    reason?: string;
  } | null;

  const { buildId, rating, reason } = body ?? {};
  if (!buildId || typeof buildId !== "string" || !rating || !RATINGS.has(rating)) {
    return Response.json({ error: "Missing or invalid rating." }, { status: 400 });
  }

  // Ownership in the same query as the id, so someone else's build id is
  // indistinguishable from a nonexistent one — and nobody can seed ratings
  // onto builds that aren't theirs.
  const build = await db.build.findFirst({
    where: { id: buildId, project: { userId: user.id } },
    select: { id: true, projectId: true, status: true, repairAttempts: true, model: true },
  });
  if (!build) return Response.json({ error: "Build not found." }, { status: 404 });

  track(EVENTS.buildRated, {
    userId: user.id,
    props: {
      buildId: build.id,
      projectId: build.projectId,
      rating,
      // Recorded alongside the rating so the dashboard can ask the question
      // that matters: are the thumbs-down builds the ones that needed repair?
      repairAttempts: build.repairAttempts,
      model: build.model,
      ...(reason && REASONS.has(reason) ? { reason } : {}),
    },
  });

  return Response.json({ ok: true });
}

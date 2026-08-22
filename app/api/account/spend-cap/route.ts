import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSpendCapStatus } from "@/lib/credits";

export const dynamic = "force-dynamic";

// The user's own ceiling on 30-day spend. Deliberately theirs to set and
// theirs to remove — a cap we imposed would be a plan limit, which is the
// thing that causes bill shock rather than the thing that prevents it.

/** Guards against a typo'd cap so large it protects nobody. */
const MAX_CAP = 1_000_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const status = await getSpendCapStatus(user.id);
  // Infinity is not valid JSON — it serializes to null, which the client
  // would then have to guess the meaning of. Send the cap and let it derive.
  return Response.json({
    cap: status.cap,
    spent: status.cap === null ? null : status.spent,
    reached: status.reached,
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { cap?: number | null } | null;
  const raw = body?.cap;

  // null clears the cap. Anything else must be a positive whole number.
  let cap: number | null = null;
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
      return Response.json({ error: "Enter a whole number of credits, or clear the cap." }, { status: 400 });
    }
    if (raw > MAX_CAP) {
      return Response.json({ error: `Caps above ${MAX_CAP.toLocaleString()} credits aren't useful — leave it off instead.` }, { status: 400 });
    }
    cap = raw;
  }

  await db.user.update({ where: { id: user.id }, data: { spendCapCredits: cap } });

  const status = await getSpendCapStatus(user.id);
  return Response.json({
    cap: status.cap,
    spent: status.cap === null ? null : status.spent,
    reached: status.reached,
  });
}

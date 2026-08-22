import { getCurrentUser } from "@/lib/auth";
import { rewardStatuses } from "./_lib";

export const dynamic = "force-dynamic";

// Read-only view of this user's rewards. Returns an empty list — never an
// error — when nothing is configured, so the settings page can simply render
// nothing rather than having to special-case a failure.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  return Response.json({ rewards: await rewardStatuses(user) });
}

import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ user: null });
  const balance = await getBalance(user.id);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name }, balance });
}

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeName } from "../_profile";

export const dynamic = "force-dynamic";

// The only field on this route is `name`, and that is not an oversight:
//
//   * EMAIL is not editable anywhere in the product. Changing it would have to
//     re-check uniqueness, invalidate the Google link that resolves an account
//     by googleId, and prove the new address belongs to the person asking —
//     none of which exists. A field that silently refused to save would be
//     worse than the read-only line the settings page shows instead.
//   * PASSWORD has no write path after signup. Nothing in app/api writes
//     passwordHash except the signup route, so there is nothing to call.
//   * ROLE is set by an operator, never by the account holder.
//
// Scoped by the session's own user id, which is the only id this route ever
// reads: there is no way to name another account.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  return Response.json({ name: user.name, email: user.email });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Send a JSON object with a name." }, { status: 400 });
  }

  // hasOwnProperty rather than `"name" in body`: `in` walks the prototype
  // chain, so a body of {} would report a name of Object.prototype.name and
  // clear a real one. Own properties only.
  if (!Object.prototype.hasOwnProperty.call(body, "name")) {
    return Response.json({ error: "Send a JSON object with a name." }, { status: 400 });
  }

  const result = normalizeName((body as { name: unknown }).name);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await db.user.update({ where: { id: user.id }, data: { name: result.name } });

  // The normalised value, not the submitted one — the caller should render
  // what was actually stored rather than the text it sent.
  return Response.json({ name: result.name });
}

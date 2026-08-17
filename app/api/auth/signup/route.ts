import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { grantCredits, SIGNUP_GRANT } from "@/lib/credits";
import { createSeedProject } from "@/lib/seed-project";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string; name?: string }
    | null;

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = await db.user.create({
    data: { email, passwordHash: await hashPassword(password), name: body?.name?.trim() || null },
  });

  await grantCredits(user.id, SIGNUP_GRANT, "signup_grant");
  await createSeedProject(user.id);
  await createSession(user.id);

  return Response.json({ id: user.id, email: user.email });
}

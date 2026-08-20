import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  // Constant-shape response whether or not the account exists, to avoid
  // leaking which emails are registered. A Google-only account has no local
  // password to check against — it never verifies here (correctly, they
  // must use "Continue with Google" instead).
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({ id: user.id, email: user.email });
}

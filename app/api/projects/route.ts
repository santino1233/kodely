import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, slug: true, publishedAt: true, updatedAt: true, createdAt: true },
  });
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim().slice(0, 80) || "Untitled site";

  const project = await db.project.create({
    data: { userId: user.id, name, slug: slugify(name) },
  });

  return Response.json({ project });
}

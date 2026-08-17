import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    include: {
      // Source is what the agent/Code-view work with; the compiled build
      // output isn't meant to be shown or edited directly.
      files: { where: { published: false, kind: "source" } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  return Response.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const { count } = await db.project.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ ok: true });
}

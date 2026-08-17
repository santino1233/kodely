import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The checkpoint list — every successful build is a restore point. Deliberately
// excludes filesSnapshot from the list payload (could be large across many
// builds); the restore route reads it directly by id instead.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const builds = await db.build.findMany({
    where: { projectId: id, status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, prompt: true, createdAt: true, filesWritten: true },
  });

  return Response.json({ builds });
}

import { Prisma } from "@prisma/client";
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
    where: {
      projectId: id,
      status: "SUCCEEDED",
      // A checkpoint is only real if its snapshot still exists. The retention
      // job (lib/retention.ts) clears filesSnapshot on old builds to reclaim
      // storage — ~105 kB per build — and without this filter those rows kept
      // rendering as restore points that 404 with "Checkpoint not found." when
      // clicked. A restore point that cannot restore is worse than no entry.
      filesSnapshot: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
    // Bounded. This was unlimited, so a heavily-iterated project returned every
    // checkpoint it had ever produced on every panel open.
    take: 100,
    select: { id: true, prompt: true, createdAt: true, filesWritten: true },
  });

  return Response.json({ builds });
}

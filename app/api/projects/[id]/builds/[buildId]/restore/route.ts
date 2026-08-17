import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizePath } from "@/lib/agent";

export const dynamic = "force-dynamic";

// Rolling back is free — it's not a generation, just restoring a snapshot
// this project already paid for when the build ran.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; buildId: string }> },
) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id, buildId } = await params;

  const build = await db.build.findFirst({
    where: { id: buildId, projectId: id, status: "SUCCEEDED", project: { userId: user.id } },
  });
  if (!build || !build.filesSnapshot) {
    return Response.json({ error: "Checkpoint not found." }, { status: 404 });
  }

  const snapshot = build.filesSnapshot as Record<string, string>;
  const entries = Object.entries(snapshot).filter(([path]) => normalizePath(path) !== null);

  await db.$transaction([
    db.projectFile.deleteMany({ where: { projectId: id, published: false } }),
    ...(entries.length > 0
      ? [
          db.projectFile.createMany({
            data: entries.map(([path, content]) => ({
              projectId: id,
              path,
              content,
              published: false,
            })),
          }),
        ]
      : []),
    db.project.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  return Response.json({ ok: true, filesRestored: entries.length });
}

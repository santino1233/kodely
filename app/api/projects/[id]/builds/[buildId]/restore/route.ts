import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizePath } from "@/lib/agent";

export const dynamic = "force-dynamic";

type Snapshot = { source: Record<string, string>; build: Record<string, string> };

function toRows(
  files: Record<string, string> | undefined,
  projectId: string,
  kind: "source" | "build",
) {
  return Object.entries(files ?? {})
    .filter(([path]) => normalizePath(path) !== null)
    .map(([path, content]) => ({ projectId, path, content, published: false, kind }));
}

// Rolling back is free — it's not a generation, just restoring a snapshot
// this project already paid for when the build ran. Restoring both the
// source AND the already-compiled build output means the preview is correct
// immediately, with no re-build needed (and no chance of that re-build
// failing on an otherwise-fine rollback).
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

  const snapshot = build.filesSnapshot as unknown as Snapshot;
  const sourceRows = toRows(snapshot.source, id, "source");
  const buildRows = toRows(snapshot.build, id, "build");

  await db.$transaction([
    db.projectFile.deleteMany({ where: { projectId: id, published: false, kind: "source" } }),
    db.projectFile.deleteMany({ where: { projectId: id, published: false, kind: "build" } }),
    ...(sourceRows.length > 0 ? [db.projectFile.createMany({ data: sourceRows })] : []),
    ...(buildRows.length > 0 ? [db.projectFile.createMany({ data: buildRows })] : []),
    db.project.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  return Response.json({ ok: true, filesRestored: sourceRows.length });
}

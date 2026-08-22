import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { zipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";

// Everything is nested under a single folder named for the slug, the way a
// GitHub "Download ZIP" behaves — unzipping into the user's Downloads folder
// should produce one project directory, not scatter package.json and src/
// across whatever they happened to be sitting in.
function entryPath(slug: string, path: string): string {
  return `${slug}/${path}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  // Scoped by userId in the same query as the id, so another user's project is
  // indistinguishable from a nonexistent one — no row, no files, no leak.
  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, slug: true },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  // The draft source tree — the real Vite+React+TS project. `published: false`
  // matches how every other source read in this app is scoped; the build output
  // (kind: "build") is compiled artefacts nobody wants in a source export.
  const files = await db.projectFile.findMany({
    where: { projectId: project.id, published: false, kind: "source" },
    orderBy: { path: "asc" },
    select: { path: true, content: true, updatedAt: true },
  });
  if (files.length === 0) {
    return Response.json({ error: "Nothing to export yet." }, { status: 404 });
  }

  // Slugs are generated as [a-z0-9-] only, but this header ends up as a
  // filename on the user's disk — re-assert that rather than trusting it.
  const filename = `${project.slug.replace(/[^a-zA-Z0-9._-]/g, "-")}.zip`;

  const stream = zipStream(
    files.map((f) => ({
      path: entryPath(project.slug, f.path),
      content: f.content,
      modifiedAt: f.updatedAt,
    })),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Private source, and the archive is rebuilt on every request anyway.
      "Cache-Control": "no-store",
    },
  });
}

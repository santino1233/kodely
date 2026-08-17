import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scanForSecrets } from "@/lib/secret-scan";
import { checkPublishRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// Publishing snapshots the draft tree onto the published tree. Deliberately
// NOT deploying to real Nxeon hosting infra in Phase 1 — that provisioner is
// still gated (see the Nxeon shared-hosting security review), so *.kodely.site
// is served straight out of this app from the published rows.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    include: { files: { where: { published: false } } },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (project.files.length === 0) {
    return Response.json({ error: "Nothing to publish yet — generate a site first." }, { status: 400 });
  }

  // Only gate genuinely new subdomains — republishing an already-live project
  // isn't the spam-farming vector this protects against.
  if (!project.publishedAt) {
    const rateLimit = await checkPublishRateLimit(user.id);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "You've published a lot of new sites today — try again tomorrow." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  }

  const leaks = scanForSecrets(project.files.map((f) => ({ path: f.path, content: f.content })));
  if (leaks.length > 0) {
    const { path, kind } = leaks[0];
    return Response.json(
      { error: `Publishing blocked: found what looks like a real secret in ${path} (${kind}). Remove it and try again.` },
      { status: 400 },
    );
  }

  await db.$transaction([
    db.projectFile.deleteMany({ where: { projectId: id, published: true } }),
    db.projectFile.createMany({
      data: project.files.map((f) => ({
        projectId: id,
        path: f.path,
        content: f.content,
        published: true,
      })),
    }),
    db.project.update({ where: { id }, data: { publishedAt: new Date() } }),
  ]);

  return Response.json({ url: `https://${project.slug}.${SITES_BASE}` });
}

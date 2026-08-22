import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { applyHead } from "./head";

export const dynamic = "force-dynamic";

// Edit a site's <head> metadata without paying for a generation.
//
// There is no SEO column anywhere — the head of the project's own index.html
// IS the storage (see lib/site-seo.ts, which only fills gaps at serve time).
// So this rewrites that file in place.
//
// Generous next to the ~60/~150 character guidance in lib/agent.ts's SYSTEM
// prompt: that guidance is about what reads well in a search result, and it is
// the panel's job to nudge. Refusing to save a 61-character title would be this
// route inventing a rule the rest of the system does not have.
const LIMITS = { title: 200, description: 400, ogTitle: 200, ogDescription: 400 } as const;

function field(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length > max ? null : v;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const title = field(body.title, LIMITS.title);
  const description = field(body.description, LIMITS.description);
  const ogTitle = field(body.ogTitle, LIMITS.ogTitle);
  const ogDescription = field(body.ogDescription, LIMITS.ogDescription);
  if (title === null || description === null || ogTitle === null || ogDescription === null) {
    return Response.json({ error: "One of those fields is too long." }, { status: 400 });
  }

  // Ownership scoped in the SAME query as the id, so someone else's project id
  // is indistinguishable from a nonexistent one.
  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  // BOTH draft trees, and each for its own reason:
  //   source — or the next generation reads the old head back and the edit
  //            silently reverts.
  //   build  — or the preview and any subsequent publish keep serving the old
  //            tags, because publish copies the draft BUILD rows.
  // Deliberately NOT published:true. Going live stays an explicit publish, so
  // editing metadata can never push an unreviewed change to a live site.
  const rows = await db.projectFile.findMany({
    where: { projectId: id, published: false, path: "index.html" },
    select: { id: true, kind: true, content: true },
  });
  if (rows.length === 0) {
    return Response.json(
      { error: "This project has no index.html yet — build the site first." },
      { status: 400 },
    );
  }

  const values = { title, description, ogTitle, ogDescription };
  const updates = rows
    .map((row) => ({ row, next: applyHead(row.content, values) }))
    .filter(({ row, next }) => next !== row.content);

  if (updates.length > 0) {
    await db.$transaction(
      updates.map(({ row, next }) =>
        db.projectFile.update({ where: { id: row.id }, data: { content: next } }),
      ),
    );
  }

  return Response.json({ ok: true, updated: updates.map((u) => u.row.kind) });
}

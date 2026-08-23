import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FOUNDATION_FILES } from "@/lib/foundation";
import { track, EVENTS } from "@/lib/events";
import { summarizeTitle } from "@/lib/title";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

/** Prisma's unique-constraint violation. Mirrors app/api/projects/[id]/route.ts's
    own copy — see that file for why this is duplicated rather than imported. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** Plain truncation — the ONLY naming fallback, used when the caller supplied
    no prompt to summarize, or the summarizer call failed or timed out. This
    is intentionally the same behaviour deriveName() used to provide inline in
    every caller (app/(portal)/dashboard/new/CreateFlow.tsx, lib/pending-prompt.ts)
    before the summarizer existed — a title call must never be able to fail a
    project creation. */
function truncateName(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed || "Untitled site";
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

  const body = (await req.json().catch(() => null)) as { name?: string; prompt?: string } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const explicitName = typeof body?.name === "string" ? body.name.trim() : "";

  // The real title: an LLM summary of the build prompt (lib/title.ts), e.g.
  // "Soul Pilates Studio" out of a paragraph describing a pilates studio site
  // — never the raw prompt truncated at 80 characters. Falls back to plain
  // truncation, and NEVER throws past this point: naming a project must never
  // be the reason project creation fails.
  let name: string;
  if (prompt) {
    try {
      name = await summarizeTitle(prompt);
    } catch (err) {
      console.error("[kodely] title summarization failed, falling back to truncation", err);
      name = truncateName(explicitName || prompt);
    }
  } else {
    name = truncateName(explicitName) || "Untitled site";
  }

  // Retry on the off chance slugify()'s random suffix collides — same pattern
  // the duplicate route (POST in app/api/projects/[id]/route.ts) already uses,
  // for the same reason: a failed create aborts the surrounding statement, so
  // there is nothing to retry IN PLACE, only the whole create again.
  let project: { id: string; name: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      project = await db.project.create({
        data: { userId: user.id, name, slug: slugify(name) },
      });
      break;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  if (!project) return Response.json({ error: "Couldn't create your project." }, { status: 500 });

  // Every project starts from the real Vite+React+TS+Tailwind foundation,
  // not a blank slate — the agent edits/extends this, it never scaffolds
  // a project from scratch.
  await db.projectFile.createMany({
    data: Object.entries(FOUNDATION_FILES).map(([path, content]) => ({
      projectId: project.id,
      path,
      content,
      published: false,
      kind: "source",
    })),
  });

  track(EVENTS.projectCreated, { userId: user.id, props: { projectId: project.id } });

  return Response.json({ project });
}

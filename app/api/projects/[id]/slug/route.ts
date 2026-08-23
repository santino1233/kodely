import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkSlugAvailability, normalizeSlug, slugFormatError } from "@/lib/slug";

export const dynamic = "force-dynamic";

/** Prisma's unique-constraint violation. Mirrors app/api/projects/[id]/route.ts's
    own copy — see that file for why this is duplicated rather than imported. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Live availability check while the customer types a new subdomain.
 *
 * GET, not POST: this has no side effects, and a GET is what lets the editor
 * fire it on every keystroke (debounced client-side) without it reading as
 * a mutation. `excludeProjectId` is this project's own id, so the project's
 * CURRENT slug reads back as available rather than "taken" by itself.
 *
 * THIS IS NOT THE SOURCE OF TRUTH — see the PUT handler below. A slug that
 * passes this check can still be taken by someone else's PUT landing first;
 * the save re-checks for real and the database's own unique constraint is
 * what actually decides.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await db.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("slug");
  if (typeof raw !== "string" || raw.length === 0) {
    return Response.json({ error: "A subdomain is required." }, { status: 400 });
  }

  const result = await checkSlugAvailability(raw, project.id);
  return Response.json(result);
}

/**
 * Change this project's subdomain — a customer-initiated act, distinct from
 * PATCH on app/api/projects/[id]/route.ts (which renames the project's
 * dashboard label and DELIBERATELY never touches the slug; see the long
 * comment on that handler for why a rename must not move a live URL).
 * This route exists precisely for when someone DOES want their address to
 * change, on purpose, with full knowledge that old links to the previous
 * address stop resolving.
 *
 * Re-validates against the database here rather than trusting the live GET
 * check above — two browser tabs, or two different customers, can both pass
 * that check for the same slug within the same second. The actual unique
 * constraint on Project.slug is the only thing that can arbitrate that race,
 * so a P2002 here is caught and reported honestly as "someone just took that"
 * rather than silently retried into a different address the customer didn't
 * ask for.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  if (typeof body?.slug !== "string") {
    return Response.json({ error: "A subdomain is required." }, { status: 400 });
  }
  const slug = normalizeSlug(body.slug);
  const formatError = slugFormatError(slug);
  if (formatError) return Response.json({ error: formatError }, { status: 400 });

  const project = await db.project.findFirst({ where: { id, userId: user.id }, select: { id: true, slug: true } });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  if (project.slug === slug) {
    return Response.json({ project: { id, slug } });
  }

  try {
    // updateMany, not update: scoping by { id, userId } in one query is what
    // makes a wrong-user id indistinguishable from a nonexistent one, same as
    // every other mutation in app/api/projects/[id]/route.ts.
    const { count } = await db.project.updateMany({
      where: { id, userId: user.id },
      data: { slug },
    });
    if (count === 0) return Response.json({ error: "Project not found." }, { status: 404 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "That address was just taken — try another." }, { status: 409 });
    }
    throw err;
  }

  return Response.json({ project: { id, slug } });
}

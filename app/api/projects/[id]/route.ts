import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { track, EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

// Same ceiling the create route applies (app/api/projects/route.ts). Kept in
// sync by hand rather than imported: route modules aren't a shared-constants
// home, and that file doesn't export it.
const NAME_MAX = 80;

// Mirrors slugify() in app/api/projects/route.ts. Duplicated rather than
// imported for the same reason as NAME_MAX — importing across route modules
// couples two request entrypoints for one pure function. The random suffix is
// what makes collisions rare; POST below still retries on the off chance.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

/** Prisma's unique-constraint violation. Structural check so this file needn't import the Prisma error namespace. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

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

/**
 * Rename. Name only.
 *
 * THE SLUG IS DELIBERATELY NOT REGENERATED HERE.
 *
 * `slug` is the published address (`<slug>.kodely.site`, and the row the public
 * site route resolves by). Renaming is a labelling act — the user is fixing what
 * their dashboard calls the thing — and it must not be able to move a live site
 * out from under its own URL. If rename re-slugged:
 *   - every existing inbound link, share, QR code, and search-engine result for
 *     the published site would 404, silently, with no redirect to fall back on;
 *   - the old slug is globally unique and would be released back into the pool,
 *     so someone else could later claim the exact URL the user just vacated —
 *     a URL takeover triggered by an action that looks purely cosmetic.
 *
 * The same rule applies to unpublished projects, on purpose. Making it
 * conditional ("re-slug only while it's still a draft") would mean the slug
 * shown in the dashboard silently changes for a draft but freezes at publish —
 * a rule nobody can predict from the UI, and one that changes a preview URL the
 * user may already have handed to someone. One rule, always true: a slug is
 * assigned once at creation and never moves.
 *
 * A user who genuinely wants a different address wants a different site, and
 * that is what POST (duplicate) gives them — a new slug, no lost links.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== "string") {
    return Response.json({ error: "A name is required." }, { status: 400 });
  }
  // Trim, cap, then trim again — slicing at 80 can leave a trailing space.
  const name = body.name.trim().slice(0, NAME_MAX).trim();
  if (!name) {
    // The create route falls back to "Untitled site" for a missing name, but a
    // rename is an explicit act: silently renaming someone's site to a
    // placeholder because their input was blank is worse than refusing.
    return Response.json({ error: "A name is required." }, { status: 400 });
  }

  // updateMany, not update: `update` can only filter on unique fields, so it
  // would have to take the id alone and check ownership in a second query.
  // Scoping by { id, userId } in ONE query is what makes a wrong-user id
  // indistinguishable from a nonexistent one.
  const { count } = await db.project.updateMany({
    where: { id, userId: user.id },
    data: { name },
  });
  if (count === 0) return Response.json({ error: "Project not found." }, { status: 404 });

  return Response.json({ project: { id, name } });
}

/**
 * Duplicate — "make a variant of this" without paying for a whole new
 * generation. Charges no credits because nothing is generated: this is a row
 * copy, no model call anywhere on the path.
 *
 * What is copied: the name (suffixed), and every DRAFT file.
 * What is NOT copied:
 *   - publish state. `publishedAt` stays null and no `published: true` rows are
 *     copied, so a duplicate cannot silently go live at a new URL. Going live is
 *     always an explicit act through the publish route.
 *   - messages and builds. The copy is a fresh starting point, not a forked
 *     history; carrying over another project's conversation and its build/cost
 *     records would misattribute both.
 *
 * Draft files are copied for BOTH kinds, not just `kind: "source"`. The editor's
 * preview reads draft `kind: "build"` rows (app/api/preview/[id]) — copying only
 * source would hand the user a duplicate that renders "Nothing built yet" and
 * force a paid rebuild to see it, which is precisely the cost this feature
 * exists to avoid. Both draft trees together are the complete working state.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const source = await db.project.findFirst({
    where: { id, userId: user.id },
    include: { files: { where: { published: false } } },
  });
  if (!source) return Response.json({ error: "Project not found." }, { status: 404 });

  // Budget for the suffix before truncating, so the copy marker always survives
  // rather than being the part that gets sliced off an already-long name.
  const SUFFIX = " (copy)";
  const name = source.name.slice(0, NAME_MAX - SUFFIX.length).trim() + SUFFIX;

  // The project row and its files are created in one transaction: a project
  // that exists with an empty file tree is a broken duplicate, and worse than
  // no duplicate at all.
  //
  // Retry wraps the WHOLE transaction. slugify()'s random suffix makes a
  // collision unlikely but not impossible, and a failed statement aborts the
  // surrounding Postgres transaction — so retrying the create in place would
  // run inside a poisoned transaction.
  let copy: { id: string; name: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      copy = await db.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: { userId: user.id, name, slug: slugify(name) },
        });
        if (source.files.length > 0) {
          await tx.projectFile.createMany({
            data: source.files.map((f) => ({
              projectId: created.id,
              path: f.path,
              content: f.content,
              published: false,
              kind: f.kind,
            })),
          });
        }
        return created;
      });
      break;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  if (!copy) return Response.json({ error: "Couldn't duplicate this site." }, { status: 500 });

  // A duplicate really is a project created, so it belongs in the same funnel.
  // EVENTS is a closed vocabulary by design (see lib/events.ts), so the copy is
  // distinguished by a prop rather than by inventing a name.
  track(EVENTS.projectCreated, {
    userId: user.id,
    props: { projectId: copy.id, source: "duplicate", sourceProjectId: source.id },
  });

  return Response.json({ project: copy });
}

/**
 * Delete. Irreversible — there is no soft-delete column and no undo.
 *
 * Cascade behaviour below was verified against the live Postgres FK catalog
 * (pg_constraint.confdeltype), not just read off schema.prisma:
 *   ProjectFile -> Project  ON DELETE CASCADE
 *   Message     -> Project  ON DELETE CASCADE
 *   Build       -> Project  ON DELETE CASCADE
 *   CreditLedger -> Build   ON DELETE SET NULL
 *
 * Two consequences worth stating explicitly:
 *
 * 1. THIS TAKES A PUBLISHED SITE OFFLINE. The cascade removes the
 *    `published: true` rows the public site route serves, and the Project row
 *    it resolves the slug by — so `<slug>.kodely.site` 404s. Deleting is the
 *    only way to withdraw a published site, and it must actually withdraw it.
 *    (Note: that route sends `Cache-Control: public, max-age=60`, so an already
 *    cached response can survive up to a minute at the edge/browser.)
 *
 * 2. THE CREDIT LEDGER SURVIVES. Builds cascade away, but CreditLedger rows
 *    referencing them are SET NULL, not deleted — the rows remain with
 *    `buildId: null`. getBalance() reads `balanceAfter` off the newest ledger
 *    row (lib/credits.ts), so a delete cannot alter, refund, or erase spend.
 *    That is the correct behaviour for an auditable ledger: deleting the
 *    artifact does not un-charge the work that produced it.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  // Read before deleting so the event can record whether a LIVE site just went
  // offline — afterwards there is nothing left to ask. Ownership is still scoped
  // in the delete itself, so this read is for telemetry, not authorization.
  const existing = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { publishedAt: true, createdAt: true },
  });

  // Ownership scoped in the same query as the id — see the note on PATCH.
  const { count } = await db.project.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return Response.json({ error: "Project not found." }, { status: 404 });

  track(EVENTS.projectDeleted, {
    userId: user.id,
    props: {
      projectId: id,
      wasPublished: Boolean(existing?.publishedAt),
      ageHours: existing
        ? Math.round((Date.now() - existing.createdAt.getTime()) / 3_600_000)
        : null,
    },
  });

  return Response.json({ ok: true });
}

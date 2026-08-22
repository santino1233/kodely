import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Owner-side triage for form submissions. The PUBLIC write endpoint is not
// here — it lives on the site's own origin, in
// app/api/site/[slug]/[[...path]]/route.ts, because that is the only origin a
// generated page is allowed to POST to (see lib/site-forms.ts). This route is
// the opposite: authenticated, first-party, and it never creates anything.

/** Ceiling on ids per call, so one request can't ask for an unbounded IN list. */
const MAX_IDS = 500;

function idList(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined; // "all of them"
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > MAX_IDS) return null;
  if (!value.every((v) => typeof v === "string" && v.length > 0 && v.length <= 64)) return null;
  return value as string[];
}

/**
 * Mark submissions read/unread, or flag/unflag them as spam.
 *
 * Ownership is established once, against the project, and every update is then
 * scoped by `projectId` — so an id belonging to somebody else's project simply
 * matches nothing. A wrong-owner project id is a 404, indistinguishable from a
 * project that does not exist.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { projectId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { ids?: unknown; read?: unknown; spam?: unknown }
    | null;
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const ids = idList(body.ids);
  if (ids === null) return Response.json({ error: "Invalid request." }, { status: 400 });

  const read = body.read;
  const spam = body.spam;
  if (read !== undefined && typeof read !== "boolean") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (spam !== undefined && typeof spam !== "boolean") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (read === undefined && spam === undefined) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const data: { readAt?: Date | null; spam?: boolean } = {};
  // readAt is a timestamp, not a flag: "unread" is null, and re-marking an
  // already-read submission does not move its timestamp (the filter below).
  if (read === true) data.readAt = new Date();
  if (read === false) data.readAt = null;
  if (spam !== undefined) data.spam = spam;

  const { count } = await db.formSubmission.updateMany({
    where: {
      projectId: project.id,
      ...(ids ? { id: { in: ids } } : {}),
      // Only when read is the ONLY change: combining it with a spam flag would
      // otherwise silently skip the already-read rows the caller asked about.
      ...(read === true && spam === undefined ? { readAt: null } : {}),
    },
    data,
  });

  return Response.json({ ok: true, updated: count });
}

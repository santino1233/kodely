import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, recordAdminAction } from "@/lib/admin-audit";
import { EVENTS } from "@/lib/events";
import { Empty, Panel, StatTile, formatDateTime } from "../../../users/ui";
import { RatingPill, reasonLabel } from "../../ui";
import NoteForm from "./NoteForm";

export const dynamic = "force-dynamic";

// One customer's support thread: what operators have written down about them,
// and the ratings they left. The two belong on the same page — "this customer
// emailed about X" is only useful next to the evidence of what X was.

const NOTE_LIMIT = 200;
const RATING_LIMIT = 20;

export default async function AdminUserNotesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // Defense in depth — see app/admin/page.tsx. The layout gate is the primary
  // one, but a layout must not be the sole authorization boundary.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { userId } = await params;

  // Recorded BEFORE the customer is even looked up, and awaited — see
  // recordAdminAction. This is the most concentrated view of one person in the
  // panel: everything anyone has written about them, next to what they rated.
  //
  // The id goes in as the TARGET, not in meta, which is what makes "everything
  // anyone did to this account" a real query — it is the column
  // AdminAuditLog indexes. Recording before the findUnique also means a probe
  // at an id that turns out not to exist still leaves a row: an admin typing
  // customer ids into the URL bar is exactly the access this log is for.
  await recordAdminAction(admin, ADMIN_ACTIONS.userNotesViewed, {
    targetType: ADMIN_TARGET_TYPES.user,
    targetId: userId,
  });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  if (!user) notFound();

  const [notes, noteTotal, ratingRows] = await Promise.all([
    db.supportNote.findMany({
      where: { userId: user.id },
      // Served straight off the @@index([userId, createdAt]) on SupportNote.
      // `id` breaks ties so two notes written in the same millisecond do not
      // swap places between renders — same idiom as the credit statement.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: NOTE_LIMIT,
      select: { id: true, createdAt: true, authorEmail: true, body: true },
    }),
    db.supportNote.count({ where: { userId: user.id } }),
    db.event.findMany({
      where: { userId: user.id, name: EVENTS.buildRated },
      orderBy: { createdAt: "desc" },
      take: RATING_LIMIT,
      select: { id: true, createdAt: true, props: true },
    }),
  ]);

  const ratings = ratingRows.map((row) => {
    const p =
      row.props !== null && typeof row.props === "object" && !Array.isArray(row.props)
        ? (row.props as Record<string, unknown>)
        : {};
    const rating = typeof p.rating === "string" ? p.rating : null;
    return {
      id: row.id,
      createdAt: row.createdAt,
      rating: rating === "up" || rating === "down" ? rating : null,
      reason: typeof p.reason === "string" ? p.reason : null,
      repairAttempts: typeof p.repairAttempts === "number" ? p.repairAttempts : null,
    };
  });

  const up = ratings.filter((r) => r.rating === "up").length;
  const down = ratings.filter((r) => r.rating === "down").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/feedback/notes"
          className="rounded text-xs text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
        >
          ← Operator notes
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">{user.email}</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          {user.name ? `${user.name} · ` : ""}
          {user.role} · signed up {formatDateTime(user.createdAt)} ·{" "}
          <Link
            href={`/admin/users/${user.id}`}
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            billing &amp; builds →
          </Link>
        </p>
        <p className="mt-1 font-mono text-xs text-black/40 dark:text-white/40">{user.id}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Notes" value={noteTotal} hint="operator-written, never customer-facing" />
        <StatTile
          label="Ratings"
          value={
            <>
              <span className="text-emerald-600 dark:text-emerald-400">{up}</span>
              <span className="text-black/30 dark:text-white/30"> / </span>
              <span className="text-red-600 dark:text-red-400">{down}</span>
            </>
          }
          hint={`up / down, last ${RATING_LIMIT}`}
        />
        <StatTile
          label="Last note"
          value={
            notes.length === 0 ? (
              <span className="text-black/30 dark:text-white/30">—</span>
            ) : (
              <span className="text-base">{formatDateTime(notes[0].createdAt).slice(0, 10)}</span>
            )
          }
          hint={notes.length === 0 ? "nobody has written one" : `by ${notes[0].authorEmail}`}
        />
      </div>

      <div className="mb-8">
        <Panel
          title="Add a note"
          subtitle="For the next person who picks up this thread — what the customer said, what was checked, what happens next."
        >
          <NoteForm userId={user.id} email={user.email} />
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Notes"
          subtitle={
            noteTotal > notes.length
              ? `Newest first. Showing the most recent ${notes.length} of ${noteTotal}.`
              : "Newest first. Append-only — nothing in the app edits or deletes a note."
          }
        >
          {notes.length === 0 ? (
            <Empty>
              No notes on this customer yet. The first one is worth writing even if it only says
              what they asked about.
            </Empty>
          ) : (
            <ol className="space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-black/50 dark:text-white/50">
                    <span className="font-medium text-black/70 dark:text-white/70">
                      {n.authorEmail}
                    </span>
                    <span className="tabular-nums">{formatDateTime(n.createdAt)}</span>
                  </div>
                  {/* Operator-written and length-capped at the form, so it is
                      shown in full — truncating the one thing a human wrote on
                      purpose would defeat the point of the page. */}
                  <p className="mt-2 text-sm whitespace-pre-wrap break-words">{n.body}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel
        title="What they rated"
        subtitle={`Their own thumbs up/down, newest first, most recent ${RATING_LIMIT}. Context for the notes above — the full inbox is on /admin/feedback.`}
      >
        {ratings.length === 0 ? (
          <Empty>
            This customer has not rated a build. Note that almost nobody has yet — rating collection
            started very recently, so this is silence rather than indifference.
          </Empty>
        ) : (
          <ol className="space-y-1.5">
            {ratings.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="w-40 shrink-0 tabular-nums text-xs text-black/50 dark:text-white/50">
                  {formatDateTime(r.createdAt)}
                </span>
                <RatingPill rating={r.rating} />
                <span className="text-black/70 dark:text-white/70">
                  {r.reason ? reasonLabel(r.reason) : "no reason given"}
                </span>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {r.repairAttempts === null
                    ? "repairs not recorded"
                    : r.repairAttempts === 0
                      ? "compiled first try"
                      : `${r.repairAttempts} repair pass(es)`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

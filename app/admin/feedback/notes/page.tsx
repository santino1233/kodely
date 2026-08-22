import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import { Empty, Panel, StatTile, TableFrame, Th, formatDateTime, truncate } from "../../users/ui";
import { buttonClass, controlClass } from "../ui";

export const dynamic = "force-dynamic";

// The way in to per-customer notes: what has been written lately, and a search
// to reach a customer who has no notes yet. Without the search there is no
// route to a customer who never rated a build — which is most of them, and
// exactly the person a support email arrives about.

const RECENT_LIMIT = 50;
const SEARCH_LIMIT = 25;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function AdminSupportNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — see app/admin/page.tsx.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const q = first((await searchParams).q).trim();

  // Recorded BEFORE the notes are read, and awaited — see recordAdminAction.
  //
  // `searched: Boolean(q)` and NOTHING MORE. The query itself must never land
  // here: on this page it is almost always a customer's email address, and an
  // audit log that quietly accumulates those is a second data-protection
  // problem wearing the clothes of a solution. Whether someone went looking is
  // the part worth keeping; who they went looking for is not ours to hoard.
  await recordAdminAction(admin, ADMIN_ACTIONS.noteListViewed, {
    meta: { searched: Boolean(q) },
  });

  // Same search shape as /admin/users: email, display name, or a raw id pasted
  // out of a log line or a support ticket.
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { id: q },
        ],
      }
    : {};

  const [noteTotal, customersWithNotes, recent, matches] = await Promise.all([
    db.supportNote.count(),
    db.user.count({ where: { supportNotes: { some: {} } } }),
    db.supportNote.findMany({
      // `id` breaks ties so the order is stable between renders.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        createdAt: true,
        authorEmail: true,
        body: true,
        userId: true,
        user: { select: { email: true } },
      },
    }),
    q
      ? db.user.findMany({
          where,
          orderBy: [{ email: "asc" }],
          take: SEARCH_LIMIT,
          select: {
            id: true,
            email: true,
            name: true,
            _count: { select: { supportNotes: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/feedback"
          className="rounded text-xs text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
        >
          ← Support inbox
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Operator notes</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          What we have written down about individual customers, so the next person picking up a
          thread has the context. Never shown to the customer — and always disclosable to them.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Notes written" value={noteTotal} />
        <StatTile label="Customers with notes" value={customersWithNotes} />
        <StatTile
          label="Last note"
          value={
            recent.length === 0 ? (
              <span className="text-black/30 dark:text-white/30">—</span>
            ) : (
              <span className="text-base">{formatDateTime(recent[0].createdAt).slice(0, 10)}</span>
            )
          }
          hint={recent.length === 0 ? "nobody has written one yet" : `by ${recent[0].authorEmail}`}
        />
      </div>

      <div className="mb-8">
        <Panel
          title="Find a customer"
          subtitle="Search by email, display name, or a user id pasted out of a ticket. Every customer has a note page, whether or not anything is written on it yet."
        >
          <form method="get" action="/admin/feedback/notes" className="flex flex-wrap items-center gap-2">
            <label htmlFor="note-search" className="sr-only">
              Search customers by email, name or user id
            </label>
            <input
              id="note-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search email, name or user id"
              className={`w-full max-w-sm placeholder:text-black/40 dark:placeholder:text-white/40 ${controlClass}`}
            />
            <button type="submit" className={buttonClass}>
              Search
            </button>
            {q ? (
              <Link
                href="/admin/feedback/notes"
                className="rounded text-sm text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
              >
                Clear
              </Link>
            ) : null}
          </form>

          {q ? (
            <div className="mt-4">
              {matches.length === 0 ? (
                <Empty>No customers match “{truncate(q, 40)}”.</Empty>
              ) : (
                <TableFrame>
                  <thead>
                    <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                      <Th>Customer</Th>
                      <Th align="right">Notes</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 dark:divide-white/10">
                    {matches.map((m) => (
                      <tr key={m.id}>
                        <td className="max-w-md px-4 py-2">
                          <Link
                            href={`/admin/feedback/notes/${m.id}`}
                            className="rounded font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                          >
                            {truncate(m.email, 48)}
                          </Link>
                          {m.name ? (
                            <div className="text-xs text-black/50 dark:text-white/50">
                              {truncate(m.name, 48)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                          {m._count.supportNotes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
              )}
              {matches.length === SEARCH_LIMIT ? (
                <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                  Showing the first {SEARCH_LIMIT} matches — narrow the search if the one you want
                  is not here.
                </p>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel
        title="Recent notes"
        subtitle={
          noteTotal > recent.length
            ? `Newest first, across all customers. Showing the most recent ${recent.length} of ${noteTotal}.`
            : "Newest first, across all customers. Bodies are truncated here — open the customer for the whole note."
        }
      >
        {recent.length === 0 ? (
          <Empty>
            No support notes yet. Nothing is broken — this table starts empty and fills as people
            write in it.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <Th>When</Th>
                <Th>Customer</Th>
                <Th>Author</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {recent.map((n) => (
                <tr key={n.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                    {formatDateTime(n.createdAt)}
                  </td>
                  <td className="max-w-[14rem] px-4 py-2">
                    <Link
                      href={`/admin/feedback/notes/${n.userId}`}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                    >
                      {truncate(n.user.email, 30)}
                    </Link>
                  </td>
                  <td className="max-w-[12rem] px-4 py-2 text-black/60 dark:text-white/60">
                    {truncate(n.authorEmail, 24)}
                  </td>
                  <td className="max-w-md px-4 py-2 text-black/70 dark:text-white/70">
                    {truncate(n.body.replace(/\s+/g, " "), 90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Panel>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Notes are append-only and attributed to whoever was signed in. They are internal, but a
        data-subject access request obliges us to hand a customer everything we hold about them —
        these rows included. Write what you would stand behind if they read it.
      </p>
    </div>
  );
}

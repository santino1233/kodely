import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import { EVENTS } from "@/lib/events";
import {
  Empty,
  Panel,
  StatTile,
  TableFrame,
  Th,
  formatDateTime,
  truncate,
} from "../users/ui";
import {
  Bar,
  Caution,
  RatingPill,
  REASONS,
  buttonClass,
  controlClass,
  isReasonId,
  reasonLabel,
} from "./ui";

export const dynamic = "force-dynamic";

// The individual side of the satisfaction percentage on /admin. That number is
// the temperature; this page is the thermometer reading you can act on — one
// row per thumbs-up/down, with the reason the customer picked.
//
// Everything here is derived from `build.rated` events (lib/events.ts, written
// by app/api/feedback/route.ts). Nothing on this page writes to the stream.

/**
 * How many ratings are pulled into memory. Ratings are low-volume by nature
 * (a fraction of builds get rated at all), and the aggregates below — the
 * reason breakdown and the repair cross-tab — have to be computed over the
 * SAME set that the table shows, or the panels would quietly disagree with
 * each other. One bounded read, no query in a loop.
 */
const WINDOW = 500;

/** Rows rendered after filtering. The window above is the honest denominator. */
const ROW_LIMIT = 200;

type Rated = {
  id: string;
  createdAt: Date;
  userId: string | null;
  rating: "up" | "down" | null;
  reason: string | null;
  model: string | null;
  buildId: string | null;
  projectId: string | null;
  /** null when the event predates the prop, not zero — the two are different facts. */
  repairAttempts: number | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Props are Json and therefore untrusted shape-wise: an event written before a
 * prop existed simply lacks it. Every field is read defensively so one odd row
 * cannot blank the page.
 */
function parseRated(row: { id: string; createdAt: Date; userId: string | null; props: unknown }): Rated {
  const p =
    row.props !== null && typeof row.props === "object" && !Array.isArray(row.props)
      ? (row.props as Record<string, unknown>)
      : {};
  const rating = str(p.rating);
  return {
    id: row.id,
    createdAt: row.createdAt,
    userId: row.userId,
    rating: rating === "up" || rating === "down" ? rating : null,
    reason: str(p.reason),
    model: str(p.model),
    buildId: str(p.buildId),
    projectId: str(p.projectId),
    repairAttempts: num(p.repairAttempts),
  };
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function href(params: { rating: string; reason: string }): string {
  const sp = new URLSearchParams();
  if (params.rating) sp.set("rating", params.rating);
  if (params.reason) sp.set("reason", params.reason);
  const qs = sp.toString();
  return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

/** One row of the repair cross-tab. */
type Bucket = { label: string; hint: string; up: number; down: number };

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so
  // a non-admin who reaches this path learns nothing from it.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  const ratingRaw = first(sp.rating);
  const rating = ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : "";
  const reasonRaw = first(sp.reason);
  const reason = reasonRaw === "none" || isReasonId(reasonRaw) ? reasonRaw : "";

  // Recorded BEFORE the ratings are read, and awaited — see recordAdminAction
  // in lib/admin-audit.ts. This page shows what named customers said about
  // their builds, so looking at it is an access to customer data.
  //
  // The filters go in meta for the same reason /admin/audit records its own:
  // "who went looking for what" is the part of a read worth keeping. Both are
  // validated against closed sets above, so a hand-typed query string cannot
  // push anything into the log that is not one of these words — and neither
  // carries a customer identifier.
  await recordAdminAction(admin, ADMIN_ACTIONS.feedbackViewed, {
    meta: { filteredByRating: rating || null, filteredByReason: reason || null },
  });

  const [total, rows] = await Promise.all([
    db.event.count({ where: { name: EVENTS.buildRated } }),
    db.event.findMany({
      where: { name: EVENTS.buildRated },
      // Served straight off the @@index([name, createdAt]) on Event.
      orderBy: { createdAt: "desc" },
      take: WINDOW,
      select: { id: true, createdAt: true, userId: true, props: true },
    }),
  ]);

  const ratings = rows.map(parseRated);

  // Two id→label lookups for the whole window, not one query per row.
  const userIds = [...new Set(ratings.map((r) => r.userId).filter((v): v is string => v !== null))];
  const projectIds = [
    ...new Set(ratings.map((r) => r.projectId).filter((v): v is string => v !== null)),
  ];

  const [users, projects] = await Promise.all([
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : Promise.resolve([]),
    projectIds.length
      ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const projectById = new Map(projects.map((p) => [p.id, p.name]));

  // ── Aggregates, over the whole window rather than the filtered view ──────
  // Filtering the breakdown by the filter it is meant to explain would make
  // every bar 100%.
  const up = ratings.filter((r) => r.rating === "up").length;
  const down = ratings.filter((r) => r.rating === "down").length;
  const rated = up + down;

  // Counted over THUMBS-DOWN only, because `down` is the denominator the panel
  // shows percentages against. Today's UI (app/projects/[id]/BuildRating.tsx)
  // only offers the reason list after a thumbs-down, but the API accepts
  // `reason` on either rating — so scoping here is what makes
  // `withReason + noReason === down` true by construction rather than by luck,
  // and keeps a stray up-with-a-reason from printing a percentage over 100.
  const downRatings = ratings.filter((r) => r.rating === "down");
  const reasonCounts = REASONS.map((r) => ({
    ...r,
    count: downRatings.filter((x) => x.reason === r.id).length,
  }));
  const noReason = downRatings.filter((r) => r.reason === null).length;
  const maxReason = Math.max(0, ...reasonCounts.map((r) => r.count), noReason);
  const withReason = reasonCounts.reduce((a, b) => a + b.count, 0);

  // ── The question this page exists to answer ──────────────────────────────
  // A thumbs-down on a build that needed a repair pass and a thumbs-down on a
  // build that compiled first try are two different bugs. The first says the
  // repair loop ships something that limps (reliability). The second says the
  // output was fine mechanically and still wasn't what they asked for
  // (quality). Averaging them together hides both.
  const clean = ratings.filter((r) => r.repairAttempts === 0);
  const repaired = ratings.filter((r) => r.repairAttempts !== null && r.repairAttempts > 0);
  const unknownRepairs = ratings.filter((r) => r.repairAttempts === null);

  const buckets: Bucket[] = [
    {
      label: "Compiled first try",
      hint: "repairAttempts = 0",
      up: clean.filter((r) => r.rating === "up").length,
      down: clean.filter((r) => r.rating === "down").length,
    },
    {
      label: "Needed a repair pass",
      hint: "repairAttempts ≥ 1",
      up: repaired.filter((r) => r.rating === "up").length,
      down: repaired.filter((r) => r.rating === "down").length,
    },
  ];
  if (unknownRepairs.length > 0) {
    buckets.push({
      label: "Not recorded",
      hint: "event has no repairAttempts prop",
      up: unknownRepairs.filter((r) => r.rating === "up").length,
      down: unknownRepairs.filter((r) => r.rating === "down").length,
    });
  }

  const cleanRated = buckets[0].up + buckets[0].down;
  const repairedRated = buckets[1].up + buckets[1].down;
  const cleanDownRate = pct(buckets[0].down, cleanRated);
  const repairedDownRate = pct(buckets[1].down, repairedRated);
  const gap =
    cleanDownRate !== null && repairedDownRate !== null ? repairedDownRate - cleanDownRate : null;

  // n is small for a long while after launch. Say so rather than letting three
  // ratings read as a finding.
  const enoughToRead = cleanRated >= 10 && repairedRated >= 10;

  // ── The filtered view ────────────────────────────────────────────────────
  const filtered = ratings.filter((r) => {
    if (rating && r.rating !== rating) return false;
    if (reason === "none") return r.reason === null;
    if (reason && r.reason !== reason) return false;
    return true;
  });
  const visible = filtered.slice(0, ROW_LIMIT);
  const filtering = rating !== "" || reason !== "";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="rounded text-xs text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Build ratings</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every individual build rating, newest first. /admin gives the satisfaction percentage;
          this is what is actually behind it. Nobody is waiting on a reply here — a rating has
          nowhere for one to land.{" "}
          <Link
            href="/admin/support"
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            Support tickets →
          </Link>{" "}
          <Link
            href="/admin/feedback/notes"
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            Operator notes →
          </Link>
        </p>
      </div>

      {total === 0 ? (
        <Caution title="Nothing recorded yet — do not read this as good news">
          <p>
            There are zero <code className="font-mono text-xs">build.rated</code> events in the
            database. Ratings only started being collected very recently, and the event stream holds
            nothing from before that shipped.
          </p>
          <p className="mt-2">
            An empty inbox here is indistinguishable from a page where everybody is happy. It is
            neither: it is a page with no data. Every count, percentage and bar below is computed
            over an empty set.
          </p>
        </Caution>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Ratings in window"
          value={rated}
          hint={
            total > ratings.length
              ? `most recent ${ratings.length} of ${total}`
              : total === 0
                ? "nothing recorded yet"
                : "the whole stream"
          }
        />
        <StatTile
          label="Thumbs down"
          value={<span className={down > 0 ? "text-red-600 dark:text-red-400" : ""}>{down}</span>}
          hint={rated === 0 ? "no ratings yet" : `${pct(down, rated)}% of ratings`}
        />
        <StatTile
          label="With a reason"
          value={withReason}
          hint={
            down === 0 ? "no thumbs-down yet" : `${noReason} thumbs-down left without one`
          }
        />
        <StatTile
          label="Needed a repair pass"
          value={repaired.length}
          tone={repaired.length > 0 ? "warn" : undefined}
          hint={
            ratings.length === 0
              ? "no ratings yet"
              : `${pct(repaired.length, ratings.length)}% of rated builds`
          }
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Rating vs. repair pass"
          subtitle="Are the thumbs-down builds the ones that needed a second generation to compile? A quality problem and a reliability problem look identical in the satisfaction percentage and need opposite fixes."
        >
          {rated === 0 ? (
            <Empty>Nothing to correlate — no build has been rated yet.</Empty>
          ) : (
            <>
              <TableFrame>
                <thead>
                  <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                    <Th>Build</Th>
                    <Th align="right">Rated</Th>
                    <Th align="right">Up</Th>
                    <Th align="right">Down</Th>
                    <Th align="right">Down rate</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {buckets.map((b) => {
                    const n = b.up + b.down;
                    const rate = pct(b.down, n);
                    return (
                      <tr key={b.label}>
                        <td className="px-4 py-2">
                          {b.label}
                          <div className="font-mono text-xs text-black/40 dark:text-white/40">
                            {b.hint}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                          {n}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {b.up}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                          {b.down}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {rate === null ? (
                            <span className="text-black/30 dark:text-white/30">—</span>
                          ) : (
                            `${rate}%`
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableFrame>

              <p className="mt-3 text-xs text-black/60 dark:text-white/60">
                {!enoughToRead ? (
                  <>
                    Too few ratings in either bucket to read as a signal — this needs at least ten
                    on each row before the gap means anything. Right now it is{" "}
                    {cleanRated} first-try and {repairedRated} repaired.
                  </>
                ) : gap !== null && gap >= 10 ? (
                  <>
                    Thumbs-down is {gap.toFixed(1)} points more likely on builds that needed a
                    repair pass. That points at <strong>reliability</strong>: the repair loop is
                    shipping something that compiles but limps. Fixing the generator&apos;s first
                    try would move both this and the green-build rate on /admin.
                  </>
                ) : gap !== null && gap <= -10 ? (
                  <>
                    Thumbs-down is {Math.abs(gap).toFixed(1)} points MORE likely on builds that
                    compiled first try — the opposite of the expected shape. Worth checking the
                    rating write path before acting on it.
                  </>
                ) : (
                  <>
                    Thumbs-down is spread evenly across builds that needed repair and builds that
                    did not ({cleanDownRate}% vs {repairedDownRate}%). That points at{" "}
                    <strong>quality</strong>, not reliability: the output was mechanically fine and
                    still was not what people asked for. Repair-loop work would not move it.
                  </>
                )}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Why people were unhappy"
          subtitle="Reason counts across the window. The reason is only offered on a thumbs-down, and it is optional — the closed list lives in app/api/feedback/route.ts."
        >
          {down === 0 ? (
            <Empty>No thumbs-down recorded, so there is nothing to break down.</Empty>
          ) : (
            <>
              <ul className="space-y-2">
                {reasonCounts.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <Link
                      href={href({ rating: "down", reason: r.id })}
                      className="w-36 shrink-0 rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                    >
                      {r.label}
                    </Link>
                    <span className="flex-1">
                      <Bar value={r.count} max={maxReason} />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
                      {r.count}
                      {down > 0 ? ` · ${pct(r.count, down)}%` : ""}
                    </span>
                  </li>
                ))}
                {noReason > 0 ? (
                  <li className="flex items-center gap-3 text-sm">
                    <Link
                      href={href({ rating: "down", reason: "none" })}
                      className="w-36 shrink-0 rounded text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
                    >
                      No reason given
                    </Link>
                    <span className="flex-1">
                      <Bar value={noReason} max={maxReason} />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
                      {noReason} · {pct(noReason, down)}%
                    </span>
                  </li>
                ) : null}
              </ul>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                Percentages are of all {down} thumbs-down, including the ones that left no reason —
                so the bars sum to less than 100%. A large &ldquo;Other&rdquo; share means the six
                buckets have stopped matching what people actually mean.
              </p>
            </>
          )}
        </Panel>
      </div>

      <form method="get" action="/admin/feedback" className="mb-6 flex flex-wrap items-center gap-2">
        <label htmlFor="rating-filter" className="text-sm text-black/60 dark:text-white/60">
          Rating
        </label>
        <select id="rating-filter" name="rating" defaultValue={rating} className={controlClass}>
          <option value="">All ratings</option>
          <option value="down">Thumbs down</option>
          <option value="up">Thumbs up</option>
        </select>

        <label htmlFor="reason-filter" className="text-sm text-black/60 dark:text-white/60">
          Reason
        </label>
        <select id="reason-filter" name="reason" defaultValue={reason} className={controlClass}>
          <option value="">All reasons</option>
          {REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value="none">No reason given</option>
        </select>

        <button type="submit" className={buttonClass}>
          Filter
        </button>
        {filtering ? (
          <Link
            href="/admin/feedback"
            className="rounded text-sm text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <Panel
        title="Ratings"
        subtitle={
          <>
            {filtering
              ? `${filtered.length} of ${ratings.length} ratings in the window match this filter.`
              : `${ratings.length} rating(s) in the window.`}
            {filtered.length > visible.length ? ` Showing the newest ${visible.length}.` : ""}
            {total > ratings.length
              ? ` The window itself is the most recent ${WINDOW} ratings of ${total}.`
              : ""}{" "}
            Prompts and generated files are never shown here — a rating is telemetry, not a copy of
            customer content.
          </>
        }
      >
        {visible.length === 0 ? (
          <Empty>
            {total === 0 ? (
              <>
                No build ratings have been recorded at all. This is an empty table, not a happy
                customer base — see the note at the top of the page.
              </>
            ) : filtering ? (
              <>No ratings in the window match this filter.</>
            ) : (
              <>No ratings in the window.</>
            )}
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <Th>When</Th>
                <Th>Rating</Th>
                <Th>Reason</Th>
                <Th>Who</Th>
                <Th>Project</Th>
                <Th>Build</Th>
                <Th>Model</Th>
                <Th align="right">Repairs</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {visible.map((r) => {
                const email = r.userId ? emailById.get(r.userId) : undefined;
                const project = r.projectId ? projectById.get(r.projectId) : undefined;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <RatingPill rating={r.rating} />
                    </td>
                    <td className="px-4 py-2 text-black/70 dark:text-white/70">
                      {r.reason ? (
                        reasonLabel(r.reason)
                      ) : (
                        <span className="text-black/30 dark:text-white/30">—</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] px-4 py-2">
                      {r.userId ? (
                        <Link
                          href={`/admin/feedback/notes/${r.userId}`}
                          className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                          title={email ? `${email} — open their operator notes` : r.userId}
                        >
                          {email ? truncate(email, 28) : truncate(r.userId, 14)}
                        </Link>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">deleted account</span>
                      )}
                    </td>
                    <td className="max-w-[12rem] px-4 py-2 text-black/70 dark:text-white/70">
                      {project ? (
                        truncate(project, 24)
                      ) : r.projectId ? (
                        <span
                          className="text-black/40 dark:text-white/40"
                          title={`Project ${r.projectId} no longer exists`}
                        >
                          deleted
                        </span>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-black/50 dark:text-white/50">
                      {r.buildId ? (
                        <span title={r.buildId}>{truncate(r.buildId, 12)}</span>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">—</span>
                      )}
                    </td>
                    <td className="max-w-[12rem] px-4 py-2 text-black/70 dark:text-white/70">
                      {r.model ? (
                        truncate(r.model, 24)
                      ) : (
                        <span className="text-black/30 dark:text-white/30">—</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        r.repairAttempts !== null && r.repairAttempts > 0
                          ? "font-medium text-amber-600 dark:text-amber-500"
                          : "text-black/70 dark:text-white/70"
                      }`}
                    >
                      {r.repairAttempts ?? <span className="text-black/30 dark:text-white/30">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        )}
      </Panel>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Ratings are self-selected: people rate when they feel strongly, so the mix here is not the
        mix of all builds. Read a thumbs-down as one person&apos;s report, and the reason breakdown
        as the trend. Follow a name through to their notes to see whether anyone has already picked
        the thread up.
      </p>
    </div>
  );
}

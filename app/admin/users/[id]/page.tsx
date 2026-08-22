import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { recordAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { MICROS_PER_CREDIT, spentInWindow } from "@/lib/credits";
import {
  Empty,
  Panel,
  StatTile,
  TableFrame,
  Th,
  formatDateTime,
  formatUsd,
  reasonLabel,
  statusClass,
  truncate,
} from "../ui";

export const dynamic = "force-dynamic";

// Bounded reads. A support question is answered from the recent tail, and an
// unbounded findMany on a heavy account would be the one slow query on this
// panel. Each table says so when it is showing a truncated view.
const LEDGER_LIMIT = 250;
const BUILD_LIMIT = 100;
const EVENT_LIMIT = 100;

function propsSummary(props: unknown): string {
  if (props === null || typeof props !== "object" || Array.isArray(props)) return "";
  return Object.entries(props as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ·  ");
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Defense in depth — see app/admin/page.tsx. The layout gate is the primary
  // one, but a layout must not be the sole authorization boundary.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;

  // Recorded BEFORE the lookup, so probing an id that doesn't exist still
  // leaves a trace. This page shows one customer in full — billing statement,
  // projects, prompts, journey — and "who opened this account" is exactly the
  // question the log exists to answer.
  await recordAdminAction(admin, ADMIN_ACTIONS.userViewed, {
    targetType: "user",
    targetId: id,
  });

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      spendCapCredits: true,
      googleId: true,
      passwordHash: true,
      stripeCustomerId: true,
    },
  });
  if (!user) notFound();

  const [
    projects,
    builds,
    ledger,
    events,
    buildTotals,
    buildStatuses,
    grantedAgg,
    spentAgg,
    ledgerTotal,
    buildTotal,
    eventTotal,
    windowSpend,
  ] = await Promise.all([
    db.project.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        _count: { select: { builds: true, files: true, messages: true } },
      },
    }),
    db.build.findMany({
      where: { project: { userId: id } },
      orderBy: { createdAt: "desc" },
      take: BUILD_LIMIT,
      select: {
        id: true,
        createdAt: true,
        endedAt: true,
        status: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costMicros: true,
        creditsCharged: true,
        repairAttempts: true,
        prompt: true,
        error: true,
        project: { select: { id: true, name: true } },
      },
    }),
    db.creditLedger.findMany({
      where: { userId: id },
      // Same ordering as lib/credits.ts getBalance, with `id` as a stable
      // tiebreak — so row 0 here IS the row that defines the balance.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LEDGER_LIMIT,
      select: {
        id: true,
        createdAt: true,
        delta: true,
        reason: true,
        balanceAfter: true,
        build: { select: { id: true, status: true, project: { select: { name: true } } } },
      },
    }),
    db.event.findMany({
      where: { userId: id },
      // Served straight off the @@index([userId, createdAt]) on Event.
      orderBy: { createdAt: "desc" },
      take: EVENT_LIMIT,
      select: { id: true, name: true, props: true, createdAt: true },
    }),
    db.build.aggregate({
      where: { project: { userId: id } },
      _sum: { costMicros: true, creditsCharged: true },
    }),
    db.build.groupBy({
      by: ["status"],
      where: { project: { userId: id } },
      _count: { _all: true },
    }),
    db.creditLedger.aggregate({ where: { userId: id, delta: { gt: 0 } }, _sum: { delta: true } }),
    db.creditLedger.aggregate({ where: { userId: id, delta: { lt: 0 } }, _sum: { delta: true } }),
    db.creditLedger.count({ where: { userId: id } }),
    db.build.count({ where: { project: { userId: id } } }),
    db.event.count({ where: { userId: id } }),
    // Reused straight from lib/credits.ts so the number shown here is the
    // same one the spend cap actually enforces — a reimplementation that
    // drifted would make this page lie about why someone was blocked.
    spentInWindow(id),
  ]);

  const balance = ledger[0]?.balanceAfter ?? 0;
  const granted = grantedAgg._sum.delta ?? 0;
  const spent = Math.abs(spentAgg._sum.delta ?? 0);

  const costMicros = buildTotals._sum.costMicros ?? 0;
  const creditsCharged = buildTotals._sum.creditsCharged ?? 0;
  const revenueMicros = creditsCharged * MICROS_PER_CREDIT;
  const marginMicros = revenueMicros - costMicros;

  const succeeded = buildStatuses.find((s) => s.status === "SUCCEEDED")?._count._all ?? 0;
  const failed = buildStatuses.find((s) => s.status === "FAILED")?._count._all ?? 0;

  // ── Integrity checks, computed from rows already in hand ────────────────
  // The ledger is append-only and starts at zero, so balanceAfter must be the
  // running sum of every delta. Walk the fetched window oldest-first; only
  // anchor on the very first row when the whole ledger is on the page.
  const chrono = [...ledger].reverse();
  const brokenRows = new Set<string>();
  if (chrono.length > 0 && ledgerTotal <= LEDGER_LIMIT && chrono[0].balanceAfter !== chrono[0].delta) {
    brokenRows.add(chrono[0].id);
  }
  for (let i = 1; i < chrono.length; i++) {
    if (chrono[i - 1].balanceAfter + chrono[i].delta !== chrono[i].balanceAfter) {
      brokenRows.add(chrono[i].id);
    }
  }

  // The anti-bill-shock contract: a build that FAILED is recorded with its
  // true cost and charged ZERO. Anything else is a refund waiting to happen,
  // and is the literal subject of "my build failed and I was charged".
  const chargedFailures = builds.filter((b) => b.status !== "SUCCEEDED" && b.creditsCharged > 0);
  const chargesOnBadBuilds = ledger.filter(
    (l) => l.build !== null && l.delta < 0 && l.build.status !== "SUCCEEDED",
  );

  const maxBalance = Math.max(1, ...ledger.map((l) => l.balanceAfter));
  const capRemaining =
    user.spendCapCredits === null ? null : Math.max(0, user.spendCapCredits - windowSpend);

  const signInMethods = [
    user.passwordHash ? "password" : null,
    user.googleId ? "google" : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/users"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← Users
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">{user.email}</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          {user.name ? `${user.name} · ` : ""}
          {user.role} · signed up {formatDateTime(user.createdAt)} ·{" "}
          {signInMethods.length > 0 ? signInMethods.join(" + ") : "no sign-in method"}
          {user.stripeCustomerId ? " · stripe customer" : ""}
        </p>
        <p className="mt-1 font-mono text-xs text-black/40 dark:text-white/40">{user.id}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Credit balance"
          value={<span className={balance === 0 ? "text-red-600 dark:text-red-400" : ""}>{balance}</span>}
          hint={
            user.spendCapCredits === null
              ? "no spend cap set"
              : `cap ${user.spendCapCredits}/30d · ${capRemaining} left`
          }
        />
        <StatTile label="Lifetime granted" value={granted} />
        <StatTile label="Lifetime spent" value={spent} hint={`${windowSpend} in last 30d`} />
        <StatTile
          label="Builds"
          value={
            <>
              <span className="text-emerald-600 dark:text-emerald-400">{succeeded}</span>
              <span className="text-black/30 dark:text-white/30"> / </span>
              <span className="text-red-600 dark:text-red-400">{failed}</span>
            </>
          }
          hint={`${buildTotal} total`}
        />
        <StatTile
          label="Imputed cost"
          value={formatUsd(costMicros, 4)}
          hint={`${creditsCharged} credits charged`}
        />
        <StatTile
          label="Margin"
          value={formatUsd(marginMicros, 4)}
          hint="credits charged at list, minus real spend"
        />
      </div>

      {(chargedFailures.length > 0 || chargesOnBadBuilds.length > 0 || brokenRows.size > 0) && (
        <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">Needs a look</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-black/70 dark:text-white/70">
            {chargedFailures.length > 0 && (
              <li>
                {chargedFailures.length} build(s) in the recent window were charged despite not
                succeeding. Failed builds are never supposed to be billed.
              </li>
            )}
            {chargesOnBadBuilds.length > 0 && (
              <li>
                {chargesOnBadBuilds.length} ledger charge(s) point at a build that is not in
                SUCCEEDED state.
              </li>
            )}
            {brokenRows.size > 0 && (
              <li>
                {brokenRows.size} ledger row(s) have a balanceAfter that does not equal the running
                sum of deltas. Marked with ! in the statement below.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mb-8">
        <Panel
          title="Credit statement"
          subtitle={
            <>
              Newest first. Every row is one append-only ledger entry; the balance column is the
              account balance immediately after it.
              {ledgerTotal > ledger.length
                ? ` Showing the most recent ${ledger.length} of ${ledgerTotal} entries.`
                : ""}
            </>
          }
        >
          {ledger.length === 0 ? (
            <Empty>No credit activity — not even a signup grant.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>When</Th>
                  <Th>What</Th>
                  <Th>Against</Th>
                  <Th align="right">Change</Th>
                  <Th align="right">Balance</Th>
                  <Th>&nbsp;</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {ledger.map((l) => {
                  const broken = brokenRows.has(l.id);
                  const badCharge = l.build !== null && l.delta < 0 && l.build.status !== "SUCCEEDED";
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                        {formatDateTime(l.createdAt)}
                      </td>
                      <td className="px-4 py-2" title={l.reason}>
                        {reasonLabel(l.reason)}
                      </td>
                      <td className="max-w-xs px-4 py-2 text-black/60 dark:text-white/60">
                        {l.build ? (
                          <>
                            {truncate(l.build.project.name, 34)}{" "}
                            <span className={statusClass(l.build.status)}>{l.build.status}</span>
                            {badCharge ? (
                              <span
                                className="ml-1 text-amber-600 dark:text-amber-500"
                                title="Charged against a build that did not succeed"
                              >
                                !
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-black/30 dark:text-white/30">—</span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums ${
                          l.delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : l.delta < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-black/40 dark:text-white/40"
                        }`}
                      >
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        <span className={l.balanceAfter === 0 ? "text-red-600 dark:text-red-400" : ""}>
                          {l.balanceAfter}
                        </span>
                        {broken ? (
                          <span
                            className="ml-1 text-amber-600 dark:text-amber-500"
                            title="balanceAfter does not match the running sum of deltas"
                          >
                            !
                          </span>
                        ) : null}
                      </td>
                      <td className="w-32 px-4 py-2">
                        {/* Balance trajectory — makes "when did they run dry" a
                            glance rather than a column of numbers to diff. */}
                        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <span
                            className="block h-full rounded-full bg-black/70 dark:bg-white/70"
                            style={{ width: `${(l.balanceAfter / maxBalance) * 100}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Projects"
          subtitle={`${projects.length} project(s). Read-only — this panel never edits customer work.`}
        >
          {projects.length === 0 ? (
            <Empty>No projects.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Published</Th>
                  <Th align="right">Builds</Th>
                  <Th align="right">Files</Th>
                  <Th align="right">Messages</Th>
                  <Th>Created</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-xs px-4 py-2">{truncate(p.name, 44)}</td>
                    <td className="max-w-xs px-4 py-2 font-mono text-xs text-black/60 dark:text-white/60">
                      {truncate(p.slug, 44)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {p.publishedAt ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {formatDateTime(p.publishedAt)}
                        </span>
                      ) : (
                        <span className="text-black/40 dark:text-white/40">draft</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {p._count.builds}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {p._count.files}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {p._count.messages}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                      {formatDateTime(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Build history"
          subtitle={
            buildTotal > builds.length
              ? `Most recent ${builds.length} of ${buildTotal} builds. Prompts are truncated on purpose.`
              : "Prompts are truncated on purpose — this panel is for billing and debugging, not reading customer content."
          }
        >
          {builds.length === 0 ? (
            <Empty>No builds.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Created</Th>
                  <Th>Status</Th>
                  <Th>Project</Th>
                  <Th>Model</Th>
                  <Th align="right">In tok</Th>
                  <Th align="right">Out tok</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Credits</Th>
                  <Th align="right">Repairs</Th>
                  <Th>Prompt</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {builds.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                      {formatDateTime(b.createdAt)}
                    </td>
                    <td className={`px-4 py-2 font-medium ${statusClass(b.status)}`}>{b.status}</td>
                    <td className="max-w-[10rem] px-4 py-2 text-black/70 dark:text-white/70">
                      {truncate(b.project.name, 24)}
                    </td>
                    <td className="px-4 py-2 text-black/70 dark:text-white/70">
                      {b.model || <span className="text-black/30 dark:text-white/30">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {b.inputTokens}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {b.outputTokens}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {formatUsd(b.costMicros, 4)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        b.status !== "SUCCEEDED" && b.creditsCharged > 0
                          ? "font-medium text-amber-600 dark:text-amber-500"
                          : "text-black/70 dark:text-white/70"
                      }`}
                    >
                      {b.creditsCharged}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        b.repairAttempts > 0
                          ? "font-medium text-amber-600 dark:text-amber-500"
                          : "text-black/70 dark:text-white/70"
                      }`}
                    >
                      {b.repairAttempts}
                    </td>
                    <td className="max-w-xs px-4 py-2 text-black/60 dark:text-white/60">
                      {truncate(b.prompt, 60)}
                      {b.error ? (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {truncate(b.error, 70)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <Panel
        title="Event journey"
        subtitle={
          eventTotal > events.length
            ? `Most recent ${events.length} of ${eventTotal} events, newest first.`
            : "Everything this account has done, newest first. Names come from the closed set in lib/events.ts."
        }
      >
        {events.length === 0 ? (
          <Empty>
            No events for this user. The stream only holds what was recorded after tracking shipped.
          </Empty>
        ) : (
          <ol className="space-y-1.5">
            {events.map((e) => {
              const summary = propsSummary(e.props);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="w-40 shrink-0 tabular-nums text-xs text-black/50 dark:text-white/50">
                    {formatDateTime(e.createdAt)}
                  </span>
                  <span className="font-medium">{e.name}</span>
                  {summary ? (
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {truncate(summary, 110)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

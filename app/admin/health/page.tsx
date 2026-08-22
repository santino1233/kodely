import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import {
  checkDatabase,
  checkEngine,
  checkFoundation,
  checkIntegrations,
  type Check,
} from "./checks";
import { BLAME_LABEL, family } from "./errors";
import {
  isWindowKey,
  loadHealthData,
  STUCK_AFTER_MS,
  WINDOWS,
  type Bucket,
  type HealthData,
  type WindowKey,
} from "./data";
import {
  Bar,
  Empty,
  formatDuration,
  formatPct,
  formatUsd,
  oneLine,
  Panel,
  PanelEmpty,
  pct,
  StatTile,
  StatusDot,
  StatusWord,
  TableFrame,
  Th,
} from "./ui";

export const dynamic = "force-dynamic";

/**
 * Below this many finished builds, a percentage is a story about four rows.
 * The page still shows the rate — hiding it would be worse — but says out loud
 * that it is indicative rather than significant.
 */
const LOW_DATA_THRESHOLD = 30;

/** A family is called out as dominant only when it is both a majority AND not a single blip. */
const DOMINANT_SHARE = 50;
const DOMINANT_MIN_COUNT = 3;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function bucketLabel(d: Date, unit: "hour" | "day"): string {
  const iso = d.toISOString();
  return unit === "hour" ? `${iso.slice(11, 13)}:00` : iso.slice(5, 10);
}

function stamp(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so
  // a non-admin learns nothing about this path.
  if (!(await getAdminUser())) notFound();

  const sp = await searchParams;
  const windowRaw = first(sp.window);
  const windowKey: WindowKey = isWindowKey(windowRaw) ? windowRaw : "7d";

  // The database check runs FIRST and on its own. Every other panel is a query
  // over the same connection, so if it is down the page degrades to the checks
  // rather than throwing a 500 at the exact moment someone needs to know why.
  const dbCheck = await checkDatabase();

  const [engine, foundationChecks] = await Promise.all([checkEngine(), checkFoundation()]);
  const integrationChecks = checkIntegrations();

  const checks: Check[] = [
    dbCheck,
    engine.credentials,
    ...foundationChecks,
    ...integrationChecks,
  ];
  const failing = checks.filter((c) => c.status === "fail");

  let data: HealthData | null = null;
  let dataError: string | null = null;
  if (dbCheck.status !== "fail") {
    try {
      data = await loadHealthData(windowKey);
    } catch {
      // Message withheld for the same reason as in checkDatabase().
      dataError =
        "The build-health queries failed after the connection check passed. Read the server log — the driver message is withheld here because it can echo the connection string.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">System health</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Read-only. Is generation broken right now, and if so, which failure is it — without
          opening psql.{" "}
          <Link
            href="/api/health"
            className="underline-offset-4 hover:underline"
            prefetch={false}
          >
            /api/health
          </Link>{" "}
          stays the unauthenticated liveness probe (process up, no dependencies touched); this page
          is the readiness view that deliberately touches them.
        </p>
      </div>

      <EngineBanner costsImputed={engine.costsImputed} sdkStamped={data?.sdkStampedBuilds ?? null} />

      {failing.length > 0 ? (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
          <div className="font-medium text-red-600 dark:text-red-400">
            {failing.length} dependency {failing.length === 1 ? "check is" : "checks are"} failing
          </div>
          <p className="mt-1 text-black/70 dark:text-white/70">
            {failing.map((c) => c.label).join(" · ")} — see Dependencies below. A failing check
            here usually explains the failure families below it.
          </p>
        </div>
      ) : null}

      <WindowPicker active={windowKey} />

      {dbCheck.status === "fail" ? (
        <Empty>
          The database is unreachable, so there is nothing to report on builds. Dependency checks
          are still shown below.
        </Empty>
      ) : dataError ? (
        <Empty>{dataError}</Empty>
      ) : data ? (
        <BuildHealth data={data} windowKey={windowKey} costsImputed={engine.costsImputed} />
      ) : null}

      <div className="mt-8">
        <Dependencies checks={checks} />
      </div>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Configuration is reported as a boolean plus the environment variable NAME. No value is ever
        rendered here, masked or otherwise. Error text is collapsed to one line and truncated
        before display because it can contain fragments of a customer’s source code.
      </p>
    </div>
  );
}

// ── Engine ────────────────────────────────────────────────────────────────

function EngineBanner({
  costsImputed,
  sdkStamped,
}: {
  costsImputed: boolean;
  sdkStamped: number | null;
}) {
  if (!costsImputed) {
    return (
      <div className="mb-6 rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
        <div className="font-medium">
          Engine: API (metered) <span className="text-black/40 dark:text-white/40">· KODELY_ENGINE</span>
        </div>
        <p className="mt-1 text-black/60 dark:text-white/60">
          Generations run against the metered Anthropic API, so every cost figure under /admin is
          real spend.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/5 p-5 text-sm">
      <div className="font-medium text-amber-700 dark:text-amber-400">
        Engine: SDK (subscription) — every cost figure under /admin is IMPUTED, not billed
      </div>
      <p className="mt-2 text-black/70 dark:text-white/70">
        KODELY_ENGINE is set to <code className="font-mono text-xs">sdk</code>, so generations run
        through the Claude Agent SDK against a subscription that is authenticated on this machine.
        Nothing is metered and no money moves. The token counts recorded on each Build are real —
        they come from the SDK’s own modelUsage — but they are priced against the API rate card to
        answer “what would this have cost on metered billing?”. Total cost, gross margin, cost per
        user, cost per build: all of them are a model, not a statement. See the header of{" "}
        <code className="font-mono text-xs">lib/agent-sdk.ts</code>.
      </p>
      <p className="mt-2 text-black/70 dark:text-white/70">
        The caveat cannot be scoped to individual rows after the fact. meterUsage() attributes a
        build to whichever model produced the most output and maps it onto the same rate keys the
        API engine records (claude-sonnet-5, claude-opus-5…), so a Build row carries no marker of
        which engine produced it.{" "}
        {sdkStamped === null
          ? null
          : sdkStamped > 0
            ? `${sdkStamped} build${sdkStamped === 1 ? "" : "s"} in this window fell back to the literal model string “claude-agent-sdk-subscription” — that is a floor on how many are imputed, never the true count.`
            : "No build in this window carries the literal “claude-agent-sdk-subscription” fallback, which is not evidence that any of them were billed."}
      </p>
      <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-400/80">
        A Claude subscription is licensed for individual use. Switch KODELY_ENGINE back to{" "}
        <code className="font-mono">api</code> before serving real customers.
      </p>
    </div>
  );
}

// ── Window picker ─────────────────────────────────────────────────────────

function WindowPicker({ active }: { active: WindowKey }) {
  return (
    <nav aria-label="Time window" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-black/50 dark:text-white/50">Window</span>
      {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
        <Link
          key={k}
          href={k === "7d" ? "/admin/health" : `/admin/health?window=${k}`}
          aria-current={k === active ? "page" : undefined}
          className={`rounded-xl border px-3 py-1.5 ${
            k === active
              ? "border-black/40 font-medium dark:border-white/40"
              : "border-black/10 text-black/60 hover:bg-black/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
          }`}
        >
          {WINDOWS[k].label}
        </Link>
      ))}
    </nav>
  );
}

// ── Build health ──────────────────────────────────────────────────────────

function BuildHealth({
  data,
  windowKey,
  costsImputed,
}: {
  data: HealthData;
  windowKey: WindowKey;
  costsImputed: boolean;
}) {
  const finished = data.succeeded + data.failed;
  const failureRate = pct(data.failed, finished);
  const lowData = finished < LOW_DATA_THRESHOLD;

  if (data.totalAllTime === 0) {
    return (
      <Empty>
        No builds have ever been recorded. Everything on this page reads from the Build table, so
        it stays empty until the first generation runs. The dependency checks below still work and
        are the useful half of this page until then.
      </Empty>
    );
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label={`Failure rate · ${WINDOWS[windowKey].label}`}
          value={formatPct(failureRate)}
          tone={
            failureRate === null ? undefined : failureRate >= 25 ? "bad" : failureRate >= 10 ? "warn" : "good"
          }
          hint={`${data.failed} of ${finished} finished`}
        />
        <StatTile
          label="Builds in window"
          value={data.total}
          hint={`${data.totalAllTime} ever`}
        />
        <StatTile
          label="Succeeded / Failed"
          value={
            <>
              <span className="text-emerald-600 dark:text-emerald-400">{data.succeeded}</span>
              <span className="text-black/30 dark:text-white/30"> / </span>
              <span className="text-red-600 dark:text-red-400">{data.failed}</span>
            </>
          }
          hint={data.running > 0 ? `${data.running} still running` : "none in flight"}
        />
        <StatTile
          label="Stuck builds"
          value={data.stuck}
          tone={data.stuck > 0 ? "warn" : undefined}
          hint={`RUNNING for over ${Math.round(STUCK_AFTER_MS / 60000)}m, all time`}
        />
        <StatTile
          label={costsImputed ? "Imputed cost" : "Real cost"}
          value={formatUsd(data.costMicros, 4)}
          hint={costsImputed ? "modelled, not billed — see above" : "metered spend in window"}
        />
      </div>

      {lowData ? (
        <p className="mb-6 rounded-xl border border-black/10 p-3 text-xs text-black/60 dark:border-white/10 dark:text-white/60">
          Low data: {finished} finished build{finished === 1 ? "" : "s"} in this window
          {data.totalAllTime < 100 ? `, ${data.totalAllTime} in the database in total` : ""}. Every
          percentage below is indicative, not significant — one build moves the failure rate by{" "}
          {finished > 0 ? (100 / finished).toFixed(0) : "—"} points. Read the failure families as a
          list of what happened, not as a distribution.
        </p>
      ) : null}

      <div className="mb-6">
        <FailureFamilies data={data} />
      </div>

      <div className="mb-6">
        <OverTime data={data} windowKey={windowKey} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Timings data={data} />
        <Repairs data={data} />
      </div>
    </>
  );
}

// ── Failure clustering ────────────────────────────────────────────────────

function FailureFamilies({ data }: { data: HealthData }) {
  const top = data.families[0];
  const dominant =
    top && top.count >= DOMINANT_MIN_COUNT && top.share >= DOMINANT_SHARE ? top : null;
  const recentLeader = [...data.families].sort((a, b) => b.recent - a.recent)[0];
  const surging =
    recentLeader &&
    recentLeader.recent >= DOMINANT_MIN_COUNT &&
    recentLeader.recentShare !== null &&
    recentLeader.recentShare >= DOMINANT_SHARE &&
    recentLeader.recentShare > recentLeader.share + 10
      ? recentLeader
      : null;

  // A family that is surging says more than one that is merely large, so it
  // wins the callout when both are true.
  const headline = surging ?? dominant;
  const maxCount = data.families.reduce((m, f) => Math.max(m, f.count), 0);

  return (
    <Panel
      title="Failure families"
      subtitle={
        <>
          Every failed build in the window, grouped by what actually went wrong. The rules live in{" "}
          <code className="font-mono">app/admin/health/errors.ts</code> and were derived from the
          error text in this database. First matching rule wins.
        </>
      }
      footnote={
        <>
          Samples are the most recent error in each family, collapsed to one line and truncated —
          Build.error is free text and can contain a customer’s source code.{" "}
          {data.failuresSampled < data.failuresTotal
            ? `Classified the ${data.failuresSampled} most recent of ${data.failuresTotal} failures in the window.`
            : null}{" "}
          “Recent” counts the newer half of the window (since {stamp(data.midpoint)} UTC).
        </>
      }
    >
      {data.families.length === 0 ? (
        <PanelEmpty>
          No failed builds in this window. Nothing to cluster — which is the answer you want.
        </PanelEmpty>
      ) : (
        <>
          {headline ? (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              {surging ? (
                <>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {family(surging.id).label} is taking over.
                  </span>{" "}
                  {formatPct(surging.recentShare)} of failures in the newer half of the window,
                  against {formatPct(surging.share)} across the whole window.
                </>
              ) : (
                <>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {family(headline.id).label} accounts for {formatPct(headline.share)} of all
                    failures.
                  </span>{" "}
                  This is one incident, not {headline.count} independent problems.
                </>
              )}
              <div className="mt-1 text-black/70 dark:text-white/70">
                {family(headline.id).hint}
              </div>
            </div>
          ) : null}

          <ul className="space-y-4">
            {data.families.map((f) => {
              const meta = family(f.id);
              return (
                <li key={f.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {meta.label}
                      <span className="ml-2 text-xs font-normal text-black/50 dark:text-white/50">
                        {BLAME_LABEL[meta.blame]}
                      </span>
                    </span>
                    <span className="tabular-nums text-black/60 dark:text-white/60">
                      <span className="font-medium text-black dark:text-white">{f.count}</span>
                      <span className="ml-2 text-xs">{formatPct(f.share)}</span>
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {f.recent} recent
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar width={maxCount === 0 ? 0 : (f.count / maxCount) * 100} tone="bad" />
                  </div>
                  <p className="mt-1.5 text-xs text-black/50 dark:text-white/50">{meta.hint}</p>
                  {f.sample ? (
                    <p className="mt-1 truncate font-mono text-xs text-black/40 dark:text-white/40">
                      {f.lastSeen ? `${stamp(f.lastSeen)} · ` : ""}
                      {oneLine(f.sample, 160)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ── Over time ─────────────────────────────────────────────────────────────

function OverTime({ data, windowKey }: { data: HealthData; windowKey: WindowKey }) {
  const max = data.buckets.reduce((m, b) => Math.max(m, b.total), 0);
  const labelEvery = Math.max(1, Math.ceil(data.buckets.length / 12));

  return (
    <Panel
      title={`Build health by ${data.unit}`}
      subtitle={`Succeeded and failed per ${data.unit} across the last ${WINDOWS[windowKey].label}, UTC. Empty ${data.unit}s are drawn — a quiet stretch is information.`}
      footnote={
        data.peakFailureRate
          ? `Worst ${data.unit}: ${formatPct(data.peakFailureRate.rate)} failure rate at ${stamp(data.peakFailureRate.start)} UTC.`
          : `No finished builds in this window.`
      }
    >
      {max === 0 ? (
        <PanelEmpty>No builds in this window.</PanelEmpty>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs text-black/50 dark:text-white/50">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm bg-emerald-500/70" />
              succeeded
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm bg-red-500/70" />
              failed
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-sm bg-black/25 dark:bg-white/25" />
              running
            </span>
          </div>
          <div className="mt-3 flex h-32 items-end gap-px" role="img" aria-label={chartSummary(data)}>
            {data.buckets.map((b) => (
              <div
                key={b.start.toISOString()}
                title={bucketTitle(b, data.unit)}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className="w-full bg-red-500/70"
                  style={{ height: `${(b.failed / max) * 100}%` }}
                />
                <div
                  className="w-full bg-black/25 dark:bg-white/25"
                  style={{ height: `${(b.running / max) * 100}%` }}
                />
                <div
                  className="w-full bg-emerald-500/70"
                  style={{ height: `${(b.succeeded / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-px text-[10px] text-black/40 dark:text-white/40">
            {data.buckets.map((b, i) => (
              <span key={b.start.toISOString()} className="flex-1 overflow-hidden text-center">
                {i % labelEvery === 0 ? bucketLabel(b.start, data.unit) : " "}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function bucketTitle(b: Bucket, unit: "hour" | "day"): string {
  const when = unit === "hour" ? `${stamp(b.start)} UTC` : b.start.toISOString().slice(0, 10);
  const finished = b.succeeded + b.failed;
  const rate = pct(b.failed, finished);
  return `${when} — ${b.total} build${b.total === 1 ? "" : "s"}: ${b.succeeded} succeeded, ${b.failed} failed${b.running ? `, ${b.running} running` : ""}${rate === null ? "" : ` (${rate}% failure rate)`}`;
}

function chartSummary(data: HealthData): string {
  return `Builds per ${data.unit}: ${data.succeeded} succeeded and ${data.failed} failed across ${data.buckets.length} ${data.unit}s.`;
}

// ── Timing ────────────────────────────────────────────────────────────────

const TIMING_ORDER = ["SUCCEEDED", "FAILED"];

function Timings({ data }: { data: HealthData }) {
  const rows = [...data.timings].sort(
    (a, b) => TIMING_ORDER.indexOf(a.status) - TIMING_ORDER.indexOf(b.status),
  );
  const succ = rows.find((r) => r.status === "SUCCEEDED");
  const fail = rows.find((r) => r.status === "FAILED");
  // A failure that comes back an order of magnitude faster than a success did
  // not fail at generation — it never got there.
  const failFast = succ?.p50 != null && fail?.p50 != null && fail.p50 * 5 < succ.p50;

  return (
    <Panel
      title="Build duration"
      subtitle="From createdAt to endedAt, split by outcome. Rows still in flight, and the occasional row whose endedAt precedes its createdAt, are excluded."
      footnote={
        <>
          {failFast ? (
            <>
              Failures are returning far faster than successes, which means they are failing before
              the model does any work — a configuration or credential problem, not a generation
              one.{" "}
            </>
          ) : null}
          The vite step inside a build is separately bounded at 60s by lib/build-site.ts; these
          figures cover the whole generation, so they are not comparable to that bound.
        </>
      }
    >
      {rows.length === 0 ? (
        <PanelEmpty>No finished builds with usable timestamps in this window.</PanelEmpty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Outcome</Th>
              <Th align="right">n</Th>
              <Th align="right">p50</Th>
              <Th align="right">p95</Th>
              <Th align="right">max</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {rows.map((r) => (
              <tr key={r.status}>
                <td
                  className={`px-4 py-2 font-medium ${
                    r.status === "SUCCEEDED"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : r.status === "FAILED"
                        ? "text-red-600 dark:text-red-400"
                        : "text-black/40 dark:text-white/40"
                  }`}
                >
                  {r.status}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {r.n}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {formatDuration(r.p50)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {formatDuration(r.p95)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {formatDuration(r.max)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Panel>
  );
}

// ── Repairs ───────────────────────────────────────────────────────────────

function Repairs({ data }: { data: HealthData }) {
  const repairRate = pct(data.repaired, data.total);
  const firstTry = pct(data.succeededFirstTry, data.succeeded);
  const maxCount = data.repairs.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <Panel
      title="Repair passes"
      subtitle="A repair is a second full generation against the same prompt, so this is a cost line as much as a quality one."
      footnote="Green-build-first-try is the same measure lib/events.ts greenBuildRate() reports on /admin, computed over this window instead of a fixed 30 days."
    >
      {data.total === 0 ? (
        <PanelEmpty>No builds in this window.</PanelEmpty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatTile
              label="Needed a repair"
              value={formatPct(repairRate)}
              tone={repairRate !== null && repairRate >= 25 ? "warn" : undefined}
              hint={`${data.repaired} of ${data.total} builds`}
            />
            <StatTile
              label="Green first try"
              value={formatPct(firstTry)}
              hint={`${data.succeededFirstTry} of ${data.succeeded} successes`}
            />
          </div>
          <ul className="mt-4 space-y-2">
            {data.repairs.map((r) => (
              <li key={r.attempts} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-black/60 dark:text-white/60">
                  {r.attempts === 0 ? "no repair" : `${r.attempts} repair${r.attempts === 1 ? "" : "s"}`}
                </span>
                <span className="flex-1">
                  <Bar width={maxCount === 0 ? 0 : (r.count / maxCount) * 100} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ── Dependencies ──────────────────────────────────────────────────────────

function Dependencies({ checks }: { checks: Check[] }) {
  return (
    <Panel
      title="Dependencies"
      subtitle="What this process needs in order to build a site. Reported as a boolean plus the environment variable name — never a value."
      footnote="Presence checks only. Nothing here connects to SMTP or Stripe, and nothing validates a credential against its provider — a key that is set but revoked reads as OK here and shows up as a failure family above."
    >
      <ul className="divide-y divide-black/10 dark:divide-white/10">
        {checks.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-1.5">
              <StatusDot status={c.status} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <StatusWord status={c.status} />
              </span>
              <span className="mt-0.5 block text-xs text-black/60 dark:text-white/60">
                {c.detail}
              </span>
              {c.env.length > 0 ? (
                <span className="mt-1 block font-mono text-[11px] text-black/40 dark:text-white/40">
                  {c.env.join(" · ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

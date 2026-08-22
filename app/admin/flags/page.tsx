import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { FLAG_CACHE_TTL_MS, listFlags, type FlagView } from "@/lib/flags";
import { deleteOrphanFlagAction, saveFlagAction, seedFlagsAction } from "./actions";

export const dynamic = "force-dynamic";

// Presentational helpers are local copies of the vocabulary established in
// app/admin/page.tsx and app/admin/users/ui.tsx (rounded-xl hairline borders,
// text-sm, tabular-nums on every figure, monochrome except where a colour
// carries status meaning) so this page reads as part of the same panel. They
// are duplicated rather than imported because app/admin/users/ui.tsx belongs
// to that route's folder.

function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-600 dark:text-amber-500" : ""
        }`}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</div> : null}
    </div>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>{children}</th>
  );
}

function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

/** Live state at a glance: green is on for everyone, amber is on for some, red is off. */
function StatePill({ flag }: { flag: FlagView }) {
  if (!flag.enabled) {
    return <span className="font-medium text-red-600 dark:text-red-400">OFF</span>;
  }
  if (flag.rolloutPct <= 0) {
    return (
      <span
        className="font-medium text-red-600 dark:text-red-400"
        title="Enabled, but rolled out to nobody — effectively off."
      >
        OFF (0%)
      </span>
    );
  }
  if (flag.rolloutPct < 100) {
    return (
      <span className="font-medium text-amber-600 dark:text-amber-500">
        ON · {flag.rolloutPct}%
      </span>
    );
  }
  return <span className="font-medium text-emerald-600 dark:text-emerald-400">ON</span>;
}

const buttonClass =
  "rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5";

const dangerButtonClass =
  "rounded-xl border border-red-600/40 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-600/5 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10";

export default async function AdminFlagsPage() {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. Same idiom as the rest of
  // /admin: 404 rather than redirect, so a non-admin learns nothing about this
  // path. The Server Actions in ./actions.ts re-check independently, because
  // they are reachable without ever rendering this page.
  if (!(await getAdminUser())) notFound();

  const flags = await listFlags();
  const known = flags.filter((f) => f.known);
  const orphans = flags.filter((f) => !f.known);

  const offFlags = known.filter((f) => !f.enabled || f.rolloutPct <= 0);
  // Off is not the same as wrong. `feature.sdk_engine` is off at its declared
  // steady state, so counting it as an alarm would light this tile amber on a
  // perfectly healthy system — and a warning that is always on is a warning
  // nobody reads on the day it means something. Only a flag switched off
  // AGAINST its `whenUnset` is worth colouring.
  const offAgainstSteadyState = offFlags.filter((f) => f.spec?.whenUnset).length;
  const partial = known.filter((f) => f.enabled && f.rolloutPct > 0 && f.rolloutPct < 100).length;
  const unseeded = known.filter((f) => !f.stored).length;
  const ttlSeconds = Math.round(FLAG_CACHE_TTL_MS / 1000);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Feature flags</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Kill switches and rollout gates, live. A change here takes effect without a deploy —
          within {ttlSeconds} seconds everywhere.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Flags in code" value={known.length} />
        <StatTile
          label="Off right now"
          value={offFlags.length}
          tone={offAgainstSteadyState > 0 ? "warn" : undefined}
          hint={
            offAgainstSteadyState > 0
              ? `${offAgainstSteadyState} switched off against its steady state`
              : offFlags.length > 0
                ? "all at their declared steady state"
                : "everything is on"
          }
        />
        <StatTile label="Partial rollout" value={partial} hint="enabled, below 100%" />
        <StatTile
          label="Propagation"
          value={`${ttlSeconds}s`}
          hint="per-process cache TTL"
        />
      </div>

      {unseeded > 0 ? (
        <form action={seedFlagsAction} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-black/15 p-4 dark:border-white/15">
            <p className="text-sm text-black/60 dark:text-white/60">
              {unseeded} {unseeded === 1 ? "flag has" : "flags have"} no row yet and{" "}
              {unseeded === 1 ? "is" : "are"} running on the code default. Create the rows to make{" "}
              {unseeded === 1 ? "it" : "them"} switchable.
            </p>
            <button type="submit" className={buttonClass}>
              Create missing rows
            </button>
          </div>
        </form>
      ) : null}

      <TableFrame>
        <thead>
          <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
            <Th>Flag</Th>
            <Th>State</Th>
            <Th>Rollout</Th>
            <Th>If DB is down</Th>
            <Th>Last changed</Th>
            <Th align="right">Switch</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/10">
          {known.map((flag) => {
            const spec = flag.spec;
            return (
              <tr key={flag.key}>
                <td className="max-w-sm px-4 py-3 align-top">
                  <div className="font-mono text-xs font-medium">{flag.key}</div>
                  <div className="mt-0.5 text-xs text-black/60 dark:text-white/60">
                    {spec?.description}
                  </div>
                  <div className="mt-1 text-xs text-black/40 dark:text-white/40">
                    {spec?.kind === "kill" ? "kill switch" : "feature gate"}
                    {flag.stored ? null : " · no row yet, using code default"}
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <StatePill flag={flag} />
                </td>

                <td className="px-4 py-3 align-top">
                  <form action={saveFlagAction} className="flex items-center gap-2">
                    <input type="hidden" name="key" value={flag.key} />
                    <input type="hidden" name="intent" value="rollout" />
                    <input
                      type="number"
                      name="rolloutPct"
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={flag.rolloutPct}
                      aria-label={`Rollout percentage for ${flag.key}`}
                      className="w-20 rounded-xl border border-black/10 bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      Set %
                    </button>
                  </form>
                  {flag.enabled ? null : (
                    <div className="mt-1 text-xs text-black/40 dark:text-white/40">
                      ignored while off
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 align-top">
                  <span
                    className={
                      spec?.whenUnavailable
                        ? "text-black/70 dark:text-white/70"
                        : "text-amber-600 dark:text-amber-500"
                    }
                    title={spec?.reason}
                  >
                    {spec?.whenUnavailable ? "fails open" : "fails closed"}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 align-top text-black/70 dark:text-white/70">
                  {flag.updatedAt ? (
                    <>
                      <div className="tabular-nums">{formatDateTime(flag.updatedAt)}</div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        {flag.updatedBy ? truncate(flag.updatedBy, 32) : "unknown"}
                      </div>
                    </>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">never</span>
                  )}
                </td>

                <td className="px-4 py-3 text-right align-top">
                  <form action={saveFlagAction} className="inline-flex">
                    <input type="hidden" name="key" value={flag.key} />
                    <input type="hidden" name="intent" value={flag.enabled ? "off" : "on"} />
                    <button
                      type="submit"
                      className={flag.enabled ? dangerButtonClass : buttonClass}
                    >
                      {flag.enabled ? "Turn off" : "Turn on"}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableFrame>

      {orphans.length > 0 ? (
        <section className="mt-8 rounded-xl border border-amber-600/30 p-5 dark:border-amber-500/30">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">
            Stored keys that no longer exist in code
          </h2>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            Nothing reads these rows, so toggling them does nothing — which is worse than having no
            switch at all, because it looks like one. Delete them, or add the key back to FLAGS in
            lib/flags.ts if the check was dropped by mistake.
          </p>
          <ul className="mt-4 space-y-2">
            {orphans.map((flag) => (
              <li key={flag.key} className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-xs">{flag.key}</span>
                <span className="flex items-center gap-3 text-xs text-black/50 dark:text-white/50">
                  {flag.enabled ? "on" : "off"} · {flag.rolloutPct}%
                  {flag.updatedAt ? ` · ${formatDateTime(flag.updatedAt)}` : ""}
                </span>
                <form action={deleteOrphanFlagAction}>
                  <input type="hidden" name="key" value={flag.key} />
                  <button type="submit" className={dangerButtonClass}>
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 space-y-2 text-xs text-black/50 dark:text-white/50">
        <p>
          <span className="font-medium">Propagation.</span> Each server process caches the whole
          table for {ttlSeconds} seconds, so a flip converges across a multi-process deploy within
          one TTL rather than instantly. The process that served this page drops its cache
          immediately, so the state above is always read straight from the database.
        </p>
        <p>
          <span className="font-medium">Rollout.</span> A percentage buckets by a hash of the user
          id plus the flag key, so a given user gets the same answer on every request, and two
          flags at 50% do not select the same half of the user base. Requests with no signed-in
          user have no stable bucket and are treated as out — a kill switch should therefore be
          left at 100% and operated with the switch, not the percentage.
        </p>
        <p>
          <span className="font-medium">If the database is down.</span> A process that has read
          this table even once keeps serving its last known values, so a switch you turned off
          stays off. Only a cold process with no snapshot falls back to the per-flag default in the
          column above — hover it for the reasoning.
        </p>
      </div>
    </div>
  );
}

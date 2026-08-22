import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, recordAdminAction } from "@/lib/admin-audit";
import { BLAME_LABEL, family } from "../../health/errors";
import {
  SNAPSHOT_PATH_LIMIT,
  diffSnapshots,
  loadBuildDetail,
  type BuildDetail,
  type ComparisonSource,
} from "../data";
import {
  Dash,
  Fact,
  FamilyBadge,
  Notice,
  Panel,
  PanelEmpty,
  RatingMark,
  StatTile,
  TableFrame,
  Th,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatInt,
  formatUsd,
  modelLabel,
  statusClass,
  truncate,
} from "../ui";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** Entries printed per added/removed/changed list in the snapshot diff. */
const DIFF_LIST_LIMIT = 10;

const COMPARISON_LABEL: Record<ComparisonSource, string> = {
  last_success: "the project's most recent successful build",
  previous_build: "the previous build on this project",
  next_build: "the next attempt on this project — this one is the earliest, so there is nothing before it",
  explicit: "the build you picked",
};

function totalTokens(b: BuildDetail): number {
  return b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens;
}

/** One comparison row. Renders both sides and marks the pair when they differ. */
function Row({
  label,
  a,
  b,
  differs,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  differs: boolean;
}) {
  return (
    <tr className={differs ? "bg-black/[0.03] dark:bg-white/[0.04]" : undefined}>
      <td className="px-4 py-2 text-xs text-black/50 dark:text-white/50">{label}</td>
      <td className="px-4 py-2 tabular-nums">{a}</td>
      <td className="px-4 py-2 tabular-nums">{b}</td>
    </tr>
  );
}

export default async function AdminBuildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — see app/admin/page.tsx. The layout gate is the primary
  // one, but a layout must not be the sole authorization boundary.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;
  const vsId = first((await searchParams).vs).trim();

  // Awaited BEFORE the lookup, so probing an id that does not exist still
  // leaves a trace, and so there is no window in which an admin has the prompt
  // and the log does not have the row.
  //
  // `dashboard.viewed` is the closest name the closed vocabulary in
  // lib/admin-audit.ts offers — it is defined as the builds-and-prompts
  // surface. The right name is `build.viewed`, which does not exist there and
  // which this change may not add; see the accompanying report. `buildId` in
  // meta is an id, not content, and is what makes the row answer "who opened
  // this build". No targetType is set: ADMIN_TARGET_TYPES has no `build`, and
  // filing a build under `project` would silently pollute the "everything done
  // to this site" filter that /admin/sites/[id] reads off targetType+targetId.
  //
  // Nothing derived from the prompt goes in meta — the rule at the top of
  // lib/admin-audit.ts.
  await recordAdminAction(admin, ADMIN_ACTIONS.buildViewed, {
    // `build` is a first-class target type now, so this no longer has to carry
    // the id in meta or discriminate itself from a real dashboard view.
    targetType: ADMIN_TARGET_TYPES.build,
    targetId: id,
    meta: { compared: Boolean(vsId) },
  });

  const data = await loadBuildDetail(id, vsId);
  if (!data) notFound();

  const { build, counterpart, counterpartSource } = data;
  const fam = build.familyId ? family(build.familyId) : null;

  const chargedFailure = build.status !== "SUCCEEDED" && build.creditsCharged > 0;
  const ledgerAgainstFailure = build.status !== "SUCCEEDED" && data.ledger.some((l) => l.delta < 0);
  const snapshotShown = build.snapshot.entries.slice(0, SNAPSHOT_PATH_LIMIT);
  const diff = counterpart ? diffSnapshots(counterpart.snapshot, build.snapshot) : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/builds"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← Builds
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className={`text-lg font-semibold tracking-tight ${statusClass(build.status)}`}>
            {build.status}
          </span>
          <span className="text-lg font-semibold tracking-tight">
            {formatDateTime(build.createdAt)}
          </span>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          <Link href={`/admin/sites/${build.project.id}`} className="underline underline-offset-2">
            {truncate(build.project.name, 50)}
          </Link>{" "}
          · owned by{" "}
          <Link
            href={`/admin/users/${build.project.user.id}`}
            className="underline underline-offset-2"
          >
            {build.project.user.email}
          </Link>{" "}
          ·{" "}
          <Link
            href={`/admin/builds?project=${build.project.id}`}
            className="underline underline-offset-2"
          >
            {data.siblingCount} build{data.siblingCount === 1 ? "" : "s"} on this project
          </Link>
        </p>
        <p className="mt-1 font-mono text-xs text-black/40 dark:text-white/40">{build.id}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Duration"
          value={formatDuration(build.createdAt, build.endedAt)}
          hint={build.endedAt ? `ended ${formatDateTime(build.endedAt)}` : "never ended"}
        />
        <StatTile label="Model" value={<span className="text-sm">{modelLabel(build.model)}</span>} />
        <StatTile
          label="Tokens"
          value={formatInt(totalTokens(build))}
          hint={`${formatInt(build.inputTokens)} in · ${formatInt(build.outputTokens)} out`}
        />
        <StatTile label="Real cost" value={formatUsd(build.costMicros, 4)} />
        <StatTile
          label="Credits charged"
          value={build.creditsCharged}
          tone={chargedFailure ? "warn" : undefined}
          hint={build.status === "SUCCEEDED" ? undefined : "failed builds are never billed"}
        />
        <StatTile
          label="Repair attempts"
          value={build.repairAttempts}
          tone={build.repairAttempts > 0 ? "warn" : undefined}
          hint={build.repairAttempts === 0 ? "compiled first try" : "did not compile first try"}
        />
      </div>

      {chargedFailure || ledgerAgainstFailure ? (
        <div className="mb-8">
          <Notice tone="warn">
            <span className="font-medium text-amber-700 dark:text-amber-500">Needs a look.</span>{" "}
            {chargedFailure
              ? `This build is ${build.status} but carries creditsCharged=${build.creditsCharged}. `
              : ""}
            {ledgerAgainstFailure
              ? "A negative ledger row points at this build even though it did not succeed. "
              : ""}
            The anti-bill-shock contract in lib/credits.ts says a build that did not succeed is
            recorded at true cost and charged zero.
          </Notice>
        </div>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Prompt"
          subtitle="What the customer asked for, in full. This is the only place in the panel that shows it whole."
        >
          <pre className="max-h-96 overflow-auto rounded-lg border border-black/10 p-3 text-xs leading-relaxed whitespace-pre-wrap dark:border-white/10">
            {build.prompt}
          </pre>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            {formatInt(build.prompt.length)} characters.
          </p>
        </Panel>

        <Panel
          title="Failure"
          subtitle={
            build.status === "FAILED"
              ? "Build.error verbatim, plus the family app/admin/health/errors.ts files it under."
              : "Nothing failed on this build."
          }
        >
          {build.status !== "FAILED" ? (
            <PanelEmpty>
              {build.status === "SUCCEEDED"
                ? "Succeeded — no error recorded."
                : `Status is ${build.status}; no error recorded yet.`}
            </PanelEmpty>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                {build.familyId ? <FamilyBadge id={build.familyId} /> : null}
                {fam ? (
                  <span className="text-xs text-black/50 dark:text-white/50">
                    blame: {BLAME_LABEL[fam.blame]}
                  </span>
                ) : null}
              </div>
              {fam ? (
                <p className="mt-3 text-xs leading-relaxed text-black/60 dark:text-white/60">
                  {fam.hint}
                </p>
              ) : null}
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-red-500/25 p-3 text-xs leading-relaxed whitespace-pre-wrap text-red-700 dark:text-red-400">
                {build.error && build.error.trim() ? build.error : "(no error text recorded)"}
              </pre>
              {build.familyId ? (
                <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                  <Link
                    href={`/admin/builds?family=${build.familyId}`}
                    className="underline underline-offset-2"
                  >
                    Every build in this family
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Assistant reply"
          subtitle="Message has no buildId — this is the first assistant message on the project inside this build's window, so it is a correlation, not a foreign key."
        >
          {!data.reply ? (
            <PanelEmpty>
              No assistant message stored for this build. app/api/generate/route.ts only writes one
              after a successful run that produced a reply.
            </PanelEmpty>
          ) : (
            <>
              {data.replyIsSuspect ? (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-500">
                  This build did not succeed, so this message is almost certainly not its output —
                  most likely the seeded welcome message from lib/seed-project.ts. Shown for
                  completeness, not attributed.
                </p>
              ) : null}
              <pre className="max-h-72 overflow-auto rounded-lg border border-black/10 p-3 text-xs leading-relaxed whitespace-pre-wrap dark:border-white/10">
                {data.reply.content}
              </pre>
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                Written {formatDateTime(data.reply.createdAt)}.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="What the customer thought"
          subtitle="build.rated events from lib/events.ts, matched on props.buildId."
        >
          {data.ratings.length === 0 ? (
            <PanelEmpty>
              No rating. Rating is optional and this instance has recorded none at all yet, so an
              empty panel here says nothing about the build.
            </PanelEmpty>
          ) : (
            <ul className="space-y-2">
              {data.ratings.map((r) => (
                <li key={`${r.createdAt.toISOString()}-${r.rating}`} className="text-sm">
                  <RatingMark rating={r.rating} />
                  {r.reason ? (
                    <span className="ml-2 text-black/60 dark:text-white/60">{truncate(r.reason, 40)}</span>
                  ) : null}
                  <span className="ml-2 text-xs text-black/40 dark:text-white/40 tabular-nums">
                    {formatDateTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Comparison"
          subtitle={
            counterpart && counterpartSource
              ? `This build against ${COMPARISON_LABEL[counterpartSource]}. Differing rows are shaded.`
              : "Nothing on this project to compare against."
          }
          footnote={
            counterpart
              ? "Snapshot comparison is by path and byte count only — file contents are never read or rendered here."
              : undefined
          }
        >
          {!counterpart ? (
            <PanelEmpty>
              {data.siblingCount <= 1
                ? "This is the only build on the project, so there is nothing to put beside it."
                : "Nothing could be chosen automatically. Pick one of the project's other builds below."}
            </PanelEmpty>
          ) : (
            <>
              {!data.hasSuccessElsewhere && counterpartSource !== "explicit" ? (
                <p className="mb-3 text-xs text-amber-600 dark:text-amber-500">
                  This project has never had a successful build, so the strong comparison — a
                  failure against the last green run — is not available. Falling back to the
                  previous build, which is a weaker signal.
                </p>
              ) : null}

              <TableFrame>
                <thead>
                  <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                    <Th>&nbsp;</Th>
                    <Th>This build</Th>
                    <Th>
                      <Link
                        href={`/admin/builds/${counterpart.id}`}
                        className="underline underline-offset-2"
                      >
                        {counterpart.status === "SUCCEEDED" ? "Last success" : "Counterpart"}
                      </Link>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  <Row
                    label="Status"
                    differs={build.status !== counterpart.status}
                    a={<span className={statusClass(build.status)}>{build.status}</span>}
                    b={<span className={statusClass(counterpart.status)}>{counterpart.status}</span>}
                  />
                  <Row
                    label="Started"
                    differs
                    a={formatDateTime(build.createdAt)}
                    b={formatDateTime(counterpart.createdAt)}
                  />
                  <Row
                    label="Took"
                    differs={false}
                    a={formatDuration(build.createdAt, build.endedAt)}
                    b={formatDuration(counterpart.createdAt, counterpart.endedAt)}
                  />
                  <Row
                    label="Model"
                    differs={build.model !== counterpart.model}
                    a={modelLabel(build.model)}
                    b={modelLabel(counterpart.model)}
                  />
                  <Row
                    label="Error family"
                    differs={build.familyId !== counterpart.familyId}
                    a={build.familyId ? <FamilyBadge id={build.familyId} showBlame={false} /> : <Dash />}
                    b={
                      counterpart.familyId ? (
                        <FamilyBadge id={counterpart.familyId} showBlame={false} />
                      ) : (
                        <Dash />
                      )
                    }
                  />
                  <Row
                    label="Repair attempts"
                    differs={build.repairAttempts !== counterpart.repairAttempts}
                    a={build.repairAttempts}
                    b={counterpart.repairAttempts}
                  />
                  <Row
                    label="Prompt length"
                    differs={build.prompt !== counterpart.prompt}
                    a={`${formatInt(build.prompt.length)} chars`}
                    b={`${formatInt(counterpart.prompt.length)} chars`}
                  />
                  <Row
                    label="Input tokens"
                    differs={build.inputTokens !== counterpart.inputTokens}
                    a={formatInt(build.inputTokens)}
                    b={formatInt(counterpart.inputTokens)}
                  />
                  <Row
                    label="Output tokens"
                    differs={build.outputTokens !== counterpart.outputTokens}
                    a={formatInt(build.outputTokens)}
                    b={formatInt(counterpart.outputTokens)}
                  />
                  <Row
                    label="Cache read / write"
                    differs={
                      build.cacheReadTokens !== counterpart.cacheReadTokens ||
                      build.cacheWriteTokens !== counterpart.cacheWriteTokens
                    }
                    a={`${formatInt(build.cacheReadTokens)} / ${formatInt(build.cacheWriteTokens)}`}
                    b={`${formatInt(counterpart.cacheReadTokens)} / ${formatInt(counterpart.cacheWriteTokens)}`}
                  />
                  <Row
                    label="Real cost"
                    differs={build.costMicros !== counterpart.costMicros}
                    a={formatUsd(build.costMicros, 4)}
                    b={formatUsd(counterpart.costMicros, 4)}
                  />
                  <Row
                    label="Credits charged"
                    differs={build.creditsCharged !== counterpart.creditsCharged}
                    a={build.creditsCharged}
                    b={counterpart.creditsCharged}
                  />
                  <Row
                    label="Files written"
                    differs={build.filesWritten !== counterpart.filesWritten}
                    a={build.filesWritten}
                    b={counterpart.filesWritten}
                  />
                  <Row
                    label="Snapshot · source"
                    differs={build.snapshot.source.files !== counterpart.snapshot.source.files}
                    a={
                      build.snapshot.present ? (
                        `${build.snapshot.source.files} files · ${formatBytes(build.snapshot.source.bytes)}`
                      ) : (
                        <Dash />
                      )
                    }
                    b={
                      counterpart.snapshot.present ? (
                        `${counterpart.snapshot.source.files} files · ${formatBytes(counterpart.snapshot.source.bytes)}`
                      ) : (
                        <Dash />
                      )
                    }
                  />
                  <Row
                    label="Snapshot · build output"
                    differs={build.snapshot.build.files !== counterpart.snapshot.build.files}
                    a={
                      build.snapshot.present ? (
                        `${build.snapshot.build.files} files · ${formatBytes(build.snapshot.build.bytes)}`
                      ) : (
                        <Dash />
                      )
                    }
                    b={
                      counterpart.snapshot.present ? (
                        `${counterpart.snapshot.build.files} files · ${formatBytes(counterpart.snapshot.build.bytes)}`
                      ) : (
                        <Dash />
                      )
                    }
                  />
                </tbody>
              </TableFrame>

              {build.prompt !== counterpart.prompt ? (
                <div className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <div className="text-xs text-black/50 dark:text-white/50">
                    The two prompts differ. The counterpart&apos;s is truncated here — read it whole
                    on{" "}
                    <Link
                      href={`/admin/builds/${counterpart.id}`}
                      className="underline underline-offset-2"
                    >
                      its own page
                    </Link>
                    .
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-black/60 dark:text-white/60">
                    {truncate(counterpart.prompt.replace(/\s+/g, " ").trim(), 300)}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                  Both builds ran the same prompt verbatim — so whatever differs is not the ask.
                </p>
              )}

              {/* Only when BOTH sides have a tree. One-sided it is not a diff:
                  a failure has no snapshot at all, and rendering that as "20
                  files removed" would describe a deletion that never happened. */}
              {!diff || !build.snapshot.present || !counterpart.snapshot.present ? (
                <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                  No snapshot comparison —{" "}
                  {!build.snapshot.present && !counterpart.snapshot.present
                    ? "neither build stored a file tree."
                    : !build.snapshot.present
                      ? "this build stored no file tree, so there is nothing to set against the counterpart's."
                      : "the counterpart stored no file tree, so there is nothing to set this build's against."}
                </p>
              ) : (
                <div className="mt-4 rounded-xl border border-black/10 p-4 text-xs dark:border-white/10">
                  <div className="font-medium">Snapshot difference</div>
                  <p className="mt-1 text-black/50 dark:text-white/50">
                    Counterpart → this build. Paths and byte counts only, keyed by universe so a
                    compiled index.html is never mistaken for the source one.
                  </p>
                  <ul className="mt-2 space-y-1 text-black/70 dark:text-white/70">
                    <li>
                      {diff.added.length} added, {diff.removed.length} removed,{" "}
                      {diff.changed.length} changed size, {diff.unchanged} identical size.
                    </li>
                    {diff.added.slice(0, DIFF_LIST_LIMIT).map((e) => (
                      <li key={`add-${e.kind}-${e.path}`} className="font-mono">
                        + {e.kind}/{truncate(e.path, 60)}{" "}
                        <span className="text-black/40 dark:text-white/40">{formatBytes(e.bytes)}</span>
                      </li>
                    ))}
                    {diff.removed.slice(0, DIFF_LIST_LIMIT).map((e) => (
                      <li key={`rem-${e.kind}-${e.path}`} className="font-mono">
                        − {e.kind}/{truncate(e.path, 60)}{" "}
                        <span className="text-black/40 dark:text-white/40">{formatBytes(e.bytes)}</span>
                      </li>
                    ))}
                    {diff.changed.slice(0, DIFF_LIST_LIMIT).map((e) => (
                      <li key={`chg-${e.kind}-${e.path}`} className="font-mono">
                        ~ {e.kind}/{truncate(e.path, 60)}{" "}
                        <span className="text-black/40 dark:text-white/40">
                          {formatBytes(e.fromBytes)} → {formatBytes(e.toBytes)}
                        </span>
                      </li>
                    ))}
                    {diff.added.length + diff.removed.length + diff.changed.length >
                    DIFF_LIST_LIMIT * 3 ? (
                      <li className="text-black/40 dark:text-white/40">
                        Each list is cut at {DIFF_LIST_LIMIT}.
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </>
          )}

          {data.siblings.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs text-black/50 dark:text-white/50">Compare against instead</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.siblings.map((s) => (
                  <Link
                    key={s.id}
                    href={`/admin/builds/${build.id}?vs=${s.id}`}
                    className={`rounded-xl border border-black/10 px-2.5 py-1 text-xs tabular-nums hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 ${
                      counterpart?.id === s.id ? "bg-black/5 dark:bg-white/10" : ""
                    }`}
                  >
                    <span className={statusClass(s.status)}>{s.status}</span>{" "}
                    {formatDateTime(s.createdAt)}
                    {s.repairAttempts > 0 ? (
                      <span className="text-amber-600 dark:text-amber-500"> ·{s.repairAttempts}r</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="File snapshot"
          subtitle="Which files the snapshot contains, and how big each one is. Contents are deliberately not shown."
          footnote="filesSnapshot is the customer's generated source. There is no operational reason to read it from an admin panel, so this section can only ever list paths and byte counts — see readSnapshot() in app/admin/builds/data.ts, the one function allowed to open the column."
        >
          {!build.snapshot.present ? (
            <PanelEmpty>
              No snapshot. Only a successful build writes one (app/api/generate/route.ts) and the
              retention job in lib/retention.ts clears it on old builds — so a null here is either a
              failure or an expired checkpoint.
            </PanelEmpty>
          ) : build.snapshot.malformed ? (
            <PanelEmpty>
              filesSnapshot is present but holds no recognisable file tree. Top-level keys:{" "}
              {truncate(build.snapshot.unknownKeys.join(", "), 80) || "(none)"}.
            </PanelEmpty>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-x-6">
                <Fact label="source">
                  {build.snapshot.source.files} · {formatBytes(build.snapshot.source.bytes)}
                </Fact>
                <Fact label="build output">
                  {build.snapshot.build.files} · {formatBytes(build.snapshot.build.bytes)}
                </Fact>
              </div>
              <TableFrame>
                <thead>
                  <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                    <Th>Universe</Th>
                    <Th>Path</Th>
                    <Th align="right">Size</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {snapshotShown.map((e) => (
                    <tr key={`${e.kind}:${e.path}`}>
                      <td className="px-4 py-1.5 text-xs text-black/50 dark:text-white/50">
                        {e.kind}
                      </td>
                      <td className="max-w-md px-4 py-1.5 font-mono text-xs">{truncate(e.path, 60)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-black/70 dark:text-white/70">
                        {formatBytes(e.bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                {build.snapshot.entries.length} file
                {build.snapshot.entries.length === 1 ? "" : "s"} ·{" "}
                {formatBytes(build.snapshot.totalBytes)} total
                {build.snapshot.entries.length > snapshotShown.length
                  ? ` · showing the first ${snapshotShown.length}`
                  : ""}
                . filesWritten on the row says {build.filesWritten} — that counts what this run
                touched, while the snapshot is the whole tree afterwards, so the two are not meant
                to agree.
                {build.snapshot.unknownKeys.length > 0
                  ? ` Unrecognised top-level key(s): ${truncate(build.snapshot.unknownKeys.join(", "), 60)}.`
                  : ""}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Billing"
          subtitle="Ledger rows written against this build. A failed build should have none that are negative."
        >
          <div className="mb-4 grid grid-cols-2 gap-x-6">
            <Fact label="Real cost">{formatUsd(build.costMicros, 4)}</Fact>
            <Fact label="Credits charged">{build.creditsCharged}</Fact>
            <Fact label="Cache read">{formatInt(build.cacheReadTokens)}</Fact>
            <Fact label="Cache write">{formatInt(build.cacheWriteTokens)}</Fact>
          </div>
          {data.ledger.length === 0 ? (
            <PanelEmpty>No ledger row references this build.</PanelEmpty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th align="right">Change</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {data.ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                      {formatDateTime(l.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-black/70 dark:text-white/70">
                      {truncate(l.reason, 30)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        l.delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : l.delta < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-black/40 dark:text-white/40"
                      }`}
                    >
                      {l.delta > 0 ? `+${l.delta}` : l.delta}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {l.balanceAfter}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <p className="text-xs text-black/50 dark:text-white/50">
        Every view of this page is written to the admin audit log before any of it is read. The
        error family and its remedy come from app/admin/health/errors.ts, the one classifier — this
        section imports it rather than keeping a second copy.
      </p>
    </div>
  );
}

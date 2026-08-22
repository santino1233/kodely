import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EVENTS } from "@/lib/events";
import { classifyError, FAMILIES, type FamilyId } from "../health/errors";

// Queries for the build inspector.
//
// Two rules govern everything below, both borrowed from surfaces that already
// got them right:
//
// 1. NO QUERY RUNS INSIDE A LOOP OVER ROWS. Same discipline as
//    app/admin/users/page.tsx: everything a page needs about its rows is
//    fetched for the CURRENT PAGE ONLY, in a fixed number of statements
//    regardless of how many rows are on it. The awkward one is the customer's
//    rating, which lives in Event.props as JSON with no foreign key — that is
//    one grouped raw statement keyed by the page's build ids, not one lookup
//    per build.
// 2. ERROR FAMILIES ARE CLASSIFIED IN TYPESCRIPT, NEVER IN SQL. The family
//    rules in ../health/errors are JavaScript regexes; translating them to
//    Postgres ARE syntax would put the vocabulary in two places and they use
//    `\b`, which means something else there. So a family FILTER is a bounded
//    scan of (id, error) followed by classification in memory — see
//    CLASSIFY_CAP, which is the same posture app/admin/health/data.ts already
//    takes with FAILURE_SAMPLE_CAP.

export const PAGE_SIZE = 25;

/**
 * How many failures are pulled back to be classified for one render. Bounds the
 * cost of the family filter and the family counts. When a scan hits this, the
 * page says so rather than quietly reporting a floor as a total.
 */
export const CLASSIFY_CAP = 2000;

/**
 * Below this many builds in the whole table, shares and comparisons on these
 * pages are anecdotes rather than rates, and the list says so out loud.
 */
export const LOW_DATA_BUILDS = 50;

/** Snapshot paths listed on the detail page before it stops and says how many are left. */
export const SNAPSHOT_PATH_LIMIT = 400;

/** Other builds on the same project offered as comparison targets. */
export const SIBLING_LIMIT = 50;

// ── Filter vocabularies ───────────────────────────────────────────────────
// Closed sets, and every guard uses Object.prototype.hasOwnProperty.call. `in`
// walks the prototype chain, so `?status=constructor` would pass a guard whose
// entire job is to say the value is one of OURS — that exact bug has produced
// reachable 500s in three separate files in this codebase.

type Filter = { label: string; where: Prisma.BuildWhereInput };

export type StatusKey = "all" | "succeeded" | "failed" | "running";

export const STATUS_FILTERS: Record<StatusKey, Filter> = {
  all: { label: "Any status", where: {} },
  succeeded: { label: "Succeeded", where: { status: "SUCCEEDED" } },
  failed: { label: "Failed", where: { status: "FAILED" } },
  // Anything not terminal. Matches how app/admin/health/data.ts counts
  // "running", so a build stuck in RUNNING forever is still reachable here.
  running: { label: "Running / other", where: { status: { notIn: ["SUCCEEDED", "FAILED"] } } },
};

export const STATUS_KEYS: StatusKey[] = ["all", "succeeded", "failed", "running"];

export function isStatusKey(v: unknown): v is StatusKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(STATUS_FILTERS, v);
}

export type RepairKey = "all" | "repaired" | "clean";

export const REPAIR_FILTERS: Record<RepairKey, Filter> = {
  all: { label: "Repaired or not", where: {} },
  repaired: { label: "Needed a repair", where: { repairAttempts: { gt: 0 } } },
  clean: { label: "Compiled first try", where: { repairAttempts: 0 } },
};

export const REPAIR_KEYS: RepairKey[] = ["all", "repaired", "clean"];

export function isRepairKey(v: unknown): v is RepairKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REPAIR_FILTERS, v);
}

const FAMILY_IDS: Record<string, true> = Object.fromEntries(FAMILIES.map((f) => [f.id, true]));

export function isFamilyId(v: unknown): v is FamilyId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FAMILY_IDS, v);
}

/**
 * The URL token for "Build.model is the empty string" — every failure that died
 * before the engine stamped a model, which is most of them. An empty `?model=`
 * has to keep meaning "any", so the empty value needs a name of its own.
 */
export const MODEL_NONE = "unstamped";

export type BuildFilters = {
  status: StatusKey;
  repair: RepairKey;
  /** Raw URL token. Resolved against the models actually present before it reaches Prisma. */
  model: string;
  family: FamilyId | null;
  projectId: string;
  q: string;
  page: number;
};

export const DEFAULT_FILTERS: BuildFilters = {
  status: "all",
  repair: "all",
  model: "",
  family: null,
  projectId: "",
  q: "",
  page: 1,
};

export function buildsHref(f: BuildFilters): string {
  const sp = new URLSearchParams();
  if (f.status !== "all") sp.set("status", f.status);
  if (f.repair !== "all") sp.set("repair", f.repair);
  if (f.model) sp.set("model", f.model);
  if (f.family) sp.set("family", f.family);
  if (f.projectId) sp.set("project", f.projectId);
  if (f.q) sp.set("q", f.q);
  if (f.page > 1) sp.set("page", String(f.page));
  const qs = sp.toString();
  return qs ? `/admin/builds?${qs}` : "/admin/builds";
}

// ── Row shapes ────────────────────────────────────────────────────────────

export type Rating = { rating: string; reason: string | null; createdAt: Date };

export type BuildRow = {
  id: string;
  createdAt: Date;
  endedAt: Date | null;
  status: string;
  model: string;
  prompt: string;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  creditsCharged: number;
  repairAttempts: number;
  filesWritten: number;
  project: { id: string; name: string; user: { id: string; email: string } };
};

export type BuildListRow = BuildRow & {
  /** null for anything that did not fail — a family only exists for a failure. */
  familyId: FamilyId | null;
  ratings: Rating[];
};

export type FamilyCount = { id: FamilyId; count: number };

export type BuildList = {
  rows: BuildListRow[];
  total: number;
  /** True when `total` is a floor because the classification scan hit its cap. */
  totalIsFloor: boolean;
  page: number;
  pageCount: number;
  models: string[];
  families: FamilyCount[];
  /** Failures the family counts were computed from, and whether that scan was capped. */
  classified: number;
  classifyCapped: number;
  totalAllTime: number;
};

const BUILD_ROW_SELECT = {
  id: true,
  createdAt: true,
  endedAt: true,
  status: true,
  model: true,
  prompt: true,
  error: true,
  inputTokens: true,
  outputTokens: true,
  costMicros: true,
  creditsCharged: true,
  repairAttempts: true,
  filesWritten: true,
  // One nested select, not a lookup per row. Prisma resolves a relation select
  // in a fixed number of statements no matter how many builds came back, which
  // is the whole point — the project name and the owner's email are what make
  // a row actionable and neither is on Build.
  project: {
    select: { id: true, name: true, user: { select: { id: true, email: true } } },
  },
} satisfies Prisma.BuildSelect;

// ── Ratings ───────────────────────────────────────────────────────────────

type RatingRow = { buildId: string | null; rating: string | null; reason: string | null; createdAt: Date };

/**
 * Customer ratings for a SET of builds, in one statement.
 *
 * `build.rated` (lib/events.ts, emitted by app/api/feedback/route.ts) carries
 * its buildId inside Event.props as JSON, with no foreign key — so this cannot
 * be a Prisma relation include, and doing it per row would be the N+1 this
 * whole module exists to avoid. `props->>'buildId'` with a bound IN list gets
 * the page's ratings in a single pass.
 */
async function ratingsFor(buildIds: string[]): Promise<Map<string, Rating[]>> {
  const out = new Map<string, Rating[]>();
  if (buildIds.length === 0) return out;

  const rows = await db.$queryRaw<RatingRow[]>`
    SELECT e."props"->>'buildId' AS "buildId",
           e."props"->>'rating'  AS "rating",
           e."props"->>'reason'  AS "reason",
           e."createdAt"
    FROM "Event" e
    WHERE e."name" = ${EVENTS.buildRated}
      AND e."props"->>'buildId' IN (${Prisma.join(buildIds)})
    ORDER BY e."createdAt" DESC`;

  for (const r of rows) {
    if (!r.buildId || !r.rating) continue;
    const list = out.get(r.buildId) ?? [];
    list.push({ rating: r.rating, reason: r.reason, createdAt: r.createdAt });
    out.set(r.buildId, list);
  }
  return out;
}

// ── The list ──────────────────────────────────────────────────────────────

/**
 * Look a filter up by key WITHOUT touching the prototype chain. The pages
 * already guard their query params with hasOwnProperty, so this can only ever
 * matter if something calls this module with an unvalidated string — but
 * `STATUS_FILTERS["constructor"]` resolving to Object.prototype.constructor is
 * exactly the accident that has produced reachable 500s in three files here, so
 * the module refuses to be the place it happens again.
 */
function pick<K extends string>(table: Record<K, Filter>, key: K): Prisma.BuildWhereInput {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key].where : {};
}

function whereFor(f: BuildFilters, status: StatusKey, model: string | null): Prisma.BuildWhereInput {
  return {
    ...pick(STATUS_FILTERS, status),
    ...pick(REPAIR_FILTERS, f.repair),
    ...(model === null ? {} : { model }),
    ...(f.projectId ? { projectId: f.projectId } : {}),
    // Searching here means searching customer prompts. The term is never
    // written to the audit log — see the call site in page.tsx.
    ...(f.q ? { prompt: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
}

export async function loadBuildList(f: BuildFilters): Promise<BuildList> {
  // A family only exists for a failure, so choosing one IMPLIES status=failed.
  // Without this the two filters can contradict each other and the page renders
  // an empty table with no explanation.
  const status: StatusKey = f.family ? "failed" : f.status;

  // Distinct models first, so the `?model=` token is validated against values
  // that actually exist rather than trusted into a where clause.
  const [totalAllTime, modelGroups] = await Promise.all([
    db.build.count(),
    db.build.groupBy({ by: ["model"], _count: { _all: true }, orderBy: { model: "asc" } }),
  ]);
  const models = modelGroups.map((m) => m.model);
  const model: string | null =
    f.model === MODEL_NONE
      ? models.includes("")
        ? ""
        : null
      : f.model && models.includes(f.model)
        ? f.model
        : null;

  const where = whereFor(f, status, model);

  // One bounded scan of failure text, used for BOTH the family counts in the
  // filter and (when a family is chosen) the id set to page over. Restricted to
  // FAILED because nothing else has an error to classify; safe to merge over
  // `where` because `status` is already "failed" or "all" whenever a family
  // filter is in play, and when it is "succeeded"/"running" the scan simply
  // returns nothing and the family filter is not offered.
  const scanApplies = status === "all" || status === "failed";
  const scanRows = scanApplies
    ? await db.build.findMany({
        where: { ...where, status: "FAILED" },
        select: { id: true, error: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CLASSIFY_CAP,
      })
    : [];

  const familyCounts = new Map<FamilyId, number>();
  const matchedIds: string[] = [];
  for (const row of scanRows) {
    const id = classifyError(row.error);
    familyCounts.set(id, (familyCounts.get(id) ?? 0) + 1);
    if (f.family && id === f.family) matchedIds.push(row.id);
  }
  const families: FamilyCount[] = FAMILIES.map((fam) => ({
    id: fam.id,
    count: familyCounts.get(fam.id) ?? 0,
  })).filter((c) => c.count > 0);

  const skip = (f.page - 1) * PAGE_SIZE;

  let total: number;
  let rows: BuildRow[];
  let totalIsFloor = false;

  if (f.family) {
    // Paging over an in-memory id list. `matchedIds` is already newest-first
    // (the scan is ordered), so slicing it preserves the table's order.
    total = matchedIds.length;
    totalIsFloor = scanRows.length >= CLASSIFY_CAP;
    const pageIds = matchedIds.slice(skip, skip + PAGE_SIZE);
    const fetched = pageIds.length
      ? await db.build.findMany({ where: { id: { in: pageIds } }, select: BUILD_ROW_SELECT })
      : [];
    const byId = new Map(fetched.map((b) => [b.id, b]));
    rows = pageIds.map((id) => byId.get(id)).filter((b): b is BuildRow => b !== undefined);
  } else {
    [total, rows] = await Promise.all([
      db.build.count({ where }),
      db.build.findMany({
        where,
        // `id` breaks ties so paging is stable when two builds share a
        // timestamp — same idiom as the user list and the audit log.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: PAGE_SIZE,
        select: BUILD_ROW_SELECT,
      }),
    ]);
  }

  const ratings = await ratingsFor(rows.map((r) => r.id));

  return {
    rows: rows.map((r) => ({
      ...r,
      familyId: r.status === "FAILED" ? classifyError(r.error) : null,
      ratings: ratings.get(r.id) ?? [],
    })),
    total,
    totalIsFloor,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    models,
    families,
    classified: scanRows.length,
    classifyCapped: scanRows.length >= CLASSIFY_CAP ? CLASSIFY_CAP : 0,
    totalAllTime,
  };
}

// ── Snapshots ─────────────────────────────────────────────────────────────

/**
 * The two file universes a snapshot holds, named exactly as
 * app/api/generate/route.ts writes them and as ProjectFile.kind spells them:
 * "source" is the Vite+React+TS project the agent edits, "build" is the
 * compiled static output. NOTE: prisma/schema.prisma still describes
 * filesSnapshot as a flat {path: content} map — it is not, and has not been
 * since the two universes split. Verified against the rows in this database.
 */
export const SNAPSHOT_KINDS = ["source", "build"] as const;

export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

export type SnapshotEntry = { kind: SnapshotKind; path: string; bytes: number };

export type SnapshotSide = { files: number; bytes: number };

export type Snapshot = {
  present: boolean;
  /** Sorted by universe, then path. CONTENT IS NEVER CARRIED OUT OF THIS FUNCTION. */
  entries: SnapshotEntry[];
  source: SnapshotSide;
  build: SnapshotSide;
  totalBytes: number;
  /** Set when filesSnapshot is present but is not an object of {path: content} maps. */
  malformed: boolean;
  /** Top-level keys that were neither "source" nor "build" — a shape drift alarm. */
  unknownKeys: string[];
};

const EMPTY_SIDE: SnapshotSide = { files: 0, bytes: 0 };

/**
 * `Build.filesSnapshot` is the customer's complete generated source. This is
 * the ONLY thing in the section allowed to touch it, and it reduces it to
 * paths and byte counts on the way out.
 *
 * There is no operational reason to read a customer's source from an admin
 * panel: "which files did this build leave behind, and how big were they"
 * answers the debugging question, and rendering the bodies would turn this
 * into a source viewer for other people's work. The type is the enforcement —
 * SnapshotEntry has nowhere to put a body.
 */
export function readSnapshot(raw: Prisma.JsonValue | null | undefined): Snapshot {
  const empty: Snapshot = {
    present: false,
    entries: [],
    source: { ...EMPTY_SIDE },
    build: { ...EMPTY_SIDE },
    totalBytes: 0,
    malformed: false,
    unknownKeys: [],
  };
  if (raw === null || raw === undefined) return empty;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ...empty, present: true, malformed: true };
  }

  const entries: SnapshotEntry[] = [];
  const sides: Record<SnapshotKind, SnapshotSide> = {
    source: { ...EMPTY_SIDE },
    build: { ...EMPTY_SIDE },
  };
  const unknownKeys: string[] = [];

  for (const [key, tree] of Object.entries(raw)) {
    // hasOwnProperty against the closed set, not a cast: the column is Json,
    // so `key` is whatever was written, and `sides[key]` on a stray "__proto__"
    // must not resolve to something off the prototype chain.
    const kind = SNAPSHOT_KINDS.find((k) => k === key);
    if (!kind) {
      unknownKeys.push(key);
      continue;
    }
    if (tree === null || typeof tree !== "object" || Array.isArray(tree)) continue;
    for (const [path, content] of Object.entries(tree)) {
      // Non-string values shouldn't happen, but a mis-shaped row must not
      // crash the page whose job is to diagnose mis-shaped rows.
      const bytes =
        typeof content === "string"
          ? Buffer.byteLength(content, "utf8")
          : Buffer.byteLength(JSON.stringify(content ?? null), "utf8");
      entries.push({ kind, path, bytes });
      sides[kind].files += 1;
      sides[kind].bytes += bytes;
    }
  }

  entries.sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind < b.kind ? 1 : -1));

  return {
    present: true,
    entries,
    source: sides.source,
    build: sides.build,
    totalBytes: sides.source.bytes + sides.build.bytes,
    // Present, an object, and yet nothing recognisable inside it.
    malformed: entries.length === 0 && unknownKeys.length > 0,
    unknownKeys,
  };
}

export type SnapshotDiff = {
  added: SnapshotEntry[];
  removed: SnapshotEntry[];
  changed: { kind: SnapshotKind; path: string; fromBytes: number; toBytes: number }[];
  unchanged: number;
};

/**
 * Path-and-size diff between two snapshots, keyed by universe AND path so a
 * compiled `index.html` is never confused with the source one. Compares byte
 * counts; never compares — or reads — content.
 */
export function diffSnapshots(from: Snapshot, to: Snapshot): SnapshotDiff {
  const key = (e: SnapshotEntry) => `${e.kind}:${e.path}`;
  const fromMap = new Map(from.entries.map((e) => [key(e), e]));
  const toMap = new Map(to.entries.map((e) => [key(e), e]));

  const added: SnapshotEntry[] = [];
  const changed: SnapshotDiff["changed"] = [];
  let unchanged = 0;
  for (const [k, entry] of toMap) {
    const before = fromMap.get(k);
    if (!before) added.push(entry);
    else if (before.bytes !== entry.bytes) {
      changed.push({ kind: entry.kind, path: entry.path, fromBytes: before.bytes, toBytes: entry.bytes });
    } else unchanged += 1;
  }
  const removed = from.entries.filter((e) => !toMap.has(key(e)));

  return { added, removed, changed, unchanged };
}

// ── The detail page ───────────────────────────────────────────────────────

export type BuildDetail = {
  id: string;
  createdAt: Date;
  endedAt: Date | null;
  status: string;
  model: string;
  prompt: string;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  filesWritten: number;
  repairAttempts: number;
  costMicros: number;
  creditsCharged: number;
  snapshot: Snapshot;
  familyId: FamilyId | null;
  project: {
    id: string;
    name: string;
    slug: string;
    publishedAt: Date | null;
    user: { id: string; email: string; name: string | null };
  };
};

export type LedgerRow = { id: string; delta: number; reason: string; balanceAfter: number; createdAt: Date };

/** The assistant's reply, correlated by time because Message has no buildId. */
export type Reply = { id: string; content: string; createdAt: Date };

export type ComparisonSource = "last_success" | "previous_build" | "next_build" | "explicit";

export type BuildDetailData = {
  build: BuildDetail;
  ledger: LedgerRow[];
  ratings: Rating[];
  reply: Reply | null;
  /**
   * True when a reply landed in the window but this build did not succeed. The
   * generate route only writes an assistant message after a SUCCESS, so such a
   * row belongs to something else — most likely the seeded welcome message from
   * lib/seed-project.ts. Flagged rather than hidden, and never presented as
   * this build's output.
   */
  replyIsSuspect: boolean;
  counterpart: BuildDetail | null;
  counterpartSource: ComparisonSource | null;
  /** Whether the project has ANY successful build other than this one. */
  hasSuccessElsewhere: boolean;
  siblingCount: number;
  /** The project's other builds, newest first, for the comparison picker. */
  siblings: Sibling[];
};

export type Sibling = {
  id: string;
  createdAt: Date;
  status: string;
  repairAttempts: number;
};

const BUILD_DETAIL_SELECT = {
  id: true,
  createdAt: true,
  endedAt: true,
  status: true,
  model: true,
  prompt: true,
  error: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
  filesWritten: true,
  repairAttempts: true,
  costMicros: true,
  creditsCharged: true,
  filesSnapshot: true,
  project: {
    select: {
      id: true,
      name: true,
      slug: true,
      publishedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  },
} satisfies Prisma.BuildSelect;

type RawDetail = Prisma.BuildGetPayload<{ select: typeof BUILD_DETAIL_SELECT }>;

function toDetail(b: RawDetail): BuildDetail {
  const { filesSnapshot, ...rest } = b;
  return {
    ...rest,
    snapshot: readSnapshot(filesSnapshot),
    familyId: b.status === "FAILED" ? classifyError(b.error) : null,
  };
}

/**
 * One build in full, plus whatever it should be compared against.
 *
 * COMPARISON IS THE POINT of this page, so the counterpart is chosen for you
 * rather than left as a thing to go and find: the project's most recent OTHER
 * successful build, because "what did it look like when this worked" is the
 * actual debugging move. Failing that — and on this database most projects have
 * never had a green build — it falls back to the previous build on the same
 * project whatever its status, and for the very FIRST build on a project (which
 * has nothing before it) to the next attempt. Each fallback is labelled as the
 * weaker comparison it is. `vsId` overrides all of them, and is ignored unless
 * it names a build on the SAME project: a comparison across customers is never
 * a legitimate operation here.
 */
export async function loadBuildDetail(id: string, vsId: string): Promise<BuildDetailData | null> {
  const raw = await db.build.findUnique({ where: { id }, select: BUILD_DETAIL_SELECT });
  if (!raw) return null;

  const build = toDetail(raw);
  const projectId = build.project.id;

  const [lastSuccess, previous, explicit, ratingsMap, nextBuild, ledger, siblingCount, siblings] =
    await Promise.all([
      db.build.findFirst({
        where: { projectId, status: "SUCCEEDED", id: { not: id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: BUILD_DETAIL_SELECT,
      }),
      db.build.findFirst({
        where: { projectId, id: { not: id }, createdAt: { lte: build.createdAt } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: BUILD_DETAIL_SELECT,
      }),
      // Scoped to this project in the WHERE, so a foreign id is
      // indistinguishable from one that does not exist — the same shape
      // app/api/feedback/route.ts uses for ownership.
      vsId && vsId !== id
        ? db.build.findFirst({ where: { id: vsId, projectId }, select: BUILD_DETAIL_SELECT })
        : Promise.resolve(null),
      ratingsFor([id]),
      // Two jobs, one query: it bounds the window the assistant's reply can
      // have been written in, AND it is the last-resort counterpart for the
      // FIRST build on a project, which has nothing before it to compare with.
      db.build.findFirst({
        where: { projectId, createdAt: { gt: build.createdAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: BUILD_DETAIL_SELECT,
      }),
      db.creditLedger.findMany({
        where: { buildId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, delta: true, reason: true, balanceAfter: true, createdAt: true },
      }),
      db.build.count({ where: { projectId } }),
      db.build.findMany({
        where: { projectId, id: { not: id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: SIBLING_LIMIT,
        select: { id: true, createdAt: true, status: true, repairAttempts: true },
      }),
    ]);

  // Message rows carry no buildId (see prisma/schema.prisma) — the generate
  // route writes the assistant reply straight after marking the build
  // succeeded. So the reply is the first assistant message on this project at
  // or after this build started and before the NEXT build started. That window
  // is exact whenever builds don't overlap, which they cannot for one project
  // in the current flow; the page says it is a correlation either way.
  const reply = await db.message.findFirst({
    where: {
      projectId,
      role: "assistant",
      createdAt: { gte: build.createdAt, ...(nextBuild ? { lt: nextBuild.createdAt } : {}) },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, content: true, createdAt: true },
  });

  const counterpartRaw = explicit ?? lastSuccess ?? previous ?? nextBuild;
  const counterpartSource: ComparisonSource | null = explicit
    ? "explicit"
    : lastSuccess
      ? "last_success"
      : previous
        ? "previous_build"
        : nextBuild
          ? "next_build"
          : null;

  return {
    build,
    ledger,
    ratings: ratingsMap.get(id) ?? [],
    reply,
    replyIsSuspect: reply !== null && build.status !== "SUCCEEDED",
    counterpart: counterpartRaw ? toDetail(counterpartRaw) : null,
    counterpartSource,
    hasSuccessElsewhere: lastSuccess !== null,
    siblingCount,
    siblings,
  };
}

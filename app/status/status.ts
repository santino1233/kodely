import { db } from "@/lib/db";

// Data for the PUBLIC status page. Unauthenticated, indexable, and read by
// people who are not us.
//
// THE RULE THIS FILE IS BUILT AROUND: nothing that leaves here may be a
// string that came from anywhere but this file. Every field below is a
// boolean, a bounded enum, a rounded percentage, or a Date. There is no
// `detail` field, no `message` field, and no `error` field, because those are
// the shapes that eventually carry a DSN, a stack frame, an environment
// variable value, or a fragment of a customer's source code.
//
// In particular:
//   - Build.error is never read here. It is free text written by three
//     different layers and can contain customer source code (see the same
//     warning in app/admin/health/errors.ts). This module reads Build.status
//     and nothing else off that table.
//   - No project name, slug, user, or hostname is selected. The two liveness
//     probes are COUNTS, so there is never a row identifier in memory to leak
//     by accident.
//   - Query failures are swallowed into a boolean. A Postgres connection
//     error can echo the connection string; app/admin/health/checks.ts
//     withholds it from an ADMIN page, so it certainly does not belong here.
//
// What this module can honestly determine is also deliberately small. It has
// no uptime monitor, no synthetic prober and no external vantage point — it
// runs inside the application, at the moment someone loads the page. Where
// there is no signal the answer is "unknown"; it is never rounded up to
// "operational". The page says so in as many words.

/**
 * The four states a component can be in.
 *
 * `unknown` is a first-class answer, not a failure of this code. "We have no
 * measurement of that" is true far more often than a status page usually
 * admits, and stating it is the difference between a status page and a
 * decoration.
 */
export type ComponentState = "operational" | "degraded" | "outage" | "unknown";

/**
 * How much data a percentage rests on, as a band rather than a count.
 *
 * A count of completed generations is this business's throughput, which is
 * not the public's business. A band still discharges the obligation to say
 * how thin the evidence is — the point of publishing the sample size is so a
 * reader can discount a percentage, and "fewer than 20" discounts it just as
 * well as "7" does.
 */
export type SampleBand = "none" | "small" | "medium" | "large";

/** At or above this success rate, generation is reported operational. */
export const OPERATIONAL_MIN_SUCCESS = 90;
/** At or above this (but below OPERATIONAL_MIN_SUCCESS), degraded. Below it, outage. */
export const DEGRADED_MIN_SUCCESS = 60;

/** Where a band starts. Rendered in the page's own explanation of the bands. */
export const SMALL_BAND_MAX = 20;
export const MEDIUM_BAND_MAX = 100;

const PRIMARY_WINDOW_HOURS = 24;
const FALLBACK_WINDOW_HOURS = 24 * 7;

export type GenerationStatus = {
  state: ComponentState;
  /** Which window the figures came from — the page prints this. */
  windowHours: number;
  /** Whole-percent success rate over finished builds, or null when there were none. */
  successRate: number | null;
  sample: SampleBand;
  /** True when the 24h window was empty and the 7d window was used instead. */
  widened: boolean;
  /** False when the query itself did not answer, which is why the state is unknown. */
  measured: boolean;
};

export type StatusSnapshot = {
  checkedAt: Date;
  /**
   * Always "operational" when this object exists at all — the page you are
   * reading was rendered by the application. That is a narrow claim and the
   * page states it as one.
   */
  app: ComponentState;
  generation: GenerationStatus;
  /** The origin's ability to read published site content. Not the edge. */
  serving: ComponentState;
};

function band(n: number): SampleBand {
  if (n <= 0) return "none";
  if (n < SMALL_BAND_MAX) return "small";
  if (n < MEDIUM_BAND_MAX) return "medium";
  return "large";
}

function rate(succeeded: number, finished: number): number | null {
  if (finished <= 0) return null;
  return Math.round((succeeded / finished) * 100);
}

function stateFromRate(successRate: number | null): ComponentState {
  if (successRate === null) return "unknown";
  if (successRate >= OPERATIONAL_MIN_SUCCESS) return "operational";
  if (successRate >= DEGRADED_MIN_SUCCESS) return "degraded";
  return "outage";
}

type Finished = { succeeded: number; failed: number };

/**
 * Finished builds in a window, by outcome.
 *
 * RUNNING rows are excluded rather than counted as failures: a build in
 * flight is not yet evidence of anything, and counting it would make a busy
 * minute look like an incident.
 */
async function finishedSince(since: Date): Promise<Finished> {
  const rows = await db.build.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "SUCCEEDED") succeeded += row._count._all;
    else if (row.status === "FAILED") failed += row._count._all;
  }
  return { succeeded, failed };
}

async function loadGeneration(now: Date): Promise<GenerationStatus> {
  try {
    const primary = await finishedSince(
      new Date(now.getTime() - PRIMARY_WINDOW_HOURS * 3_600_000),
    );
    let finished = primary.succeeded + primary.failed;
    let succeeded = primary.succeeded;
    let windowHours = PRIMARY_WINDOW_HOURS;
    let widened = false;

    // A quiet day is not an outage. If nothing finished in 24 hours there is
    // nothing to average, so widen once and say that the window was widened
    // rather than silently reporting a week as if it were a day.
    if (finished === 0) {
      const fallback = await finishedSince(
        new Date(now.getTime() - FALLBACK_WINDOW_HOURS * 3_600_000),
      );
      finished = fallback.succeeded + fallback.failed;
      succeeded = fallback.succeeded;
      windowHours = FALLBACK_WINDOW_HOURS;
      widened = true;
    }

    const successRate = rate(succeeded, finished);
    return {
      state: stateFromRate(successRate),
      windowHours,
      successRate,
      sample: band(finished),
      widened,
      measured: true,
    };
  } catch {
    // Deliberately no message. The driver's text can carry the connection
    // string, and this page is public.
    return {
      state: "unknown",
      windowHours: PRIMARY_WINDOW_HOURS,
      successRate: null,
      sample: "none",
      widened: false,
      measured: false,
    };
  }
}

/**
 * Can the origin still read the rows a published site is served from?
 *
 * app/api/site/[slug]/[[...path]] answers every request for a published site
 * out of `Project` (for `publishedAt`) and `ProjectFile` (for the compiled
 * output). This runs the same two reads as counts, so a failure here means
 * published sites genuinely cannot be served from this origin — and a success
 * means only that, which the page spells out. DNS, TLS and the CDN in front
 * of the origin are not on this code path and are not checked anywhere.
 *
 * Zero published sites is not a failure: the query answered.
 */
async function loadServing(): Promise<ComponentState> {
  try {
    await db.project.count({ where: { publishedAt: { not: null } } });
    await db.projectFile.count({ where: { published: true, kind: "build" } });
    return "operational";
  } catch {
    return "outage";
  }
}

const SEVERITY: Record<ComponentState, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  outage: 3,
};

/**
 * The banner state. `unknown` outranks `operational` so that a page which
 * cannot measure something never presents itself as all-clear, but ranks
 * below `degraded` so a real, measured problem is what the headline says.
 */
export function worstOf(states: ComponentState[]): ComponentState {
  return states.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), "operational");
}

export async function loadStatus(): Promise<StatusSnapshot> {
  const checkedAt = new Date();
  const [generation, serving] = await Promise.all([loadGeneration(checkedAt), loadServing()]);
  return { checkedAt, app: "operational", generation, serving };
}

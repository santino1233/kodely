import { db } from "./db";

// First-party event stream. Every product analytic — the activation funnel,
// retention cohorts, per-user journeys, attribution, the admin overview — is a
// query over this one table rather than its own bespoke tracking.
//
// Two rules keep it useful:
//
// 1. NAMES ARE A CLOSED SET. Free-text event names rot within weeks: three
//    spellings of the same thing, and every funnel query silently undercounts.
//    EVENTS below is the whole vocabulary; adding one is a deliberate edit.
// 2. PROPS ARE SMALL AND NON-PII. Ids, counts, short enum-ish strings. Never
//    prompt bodies, never generated content, never anything that would make
//    this table a second copy of user data with different retention rules.

// NOTE: every name here must actually be emitted somewhere. Two acquisition
// names (landing.viewed, landing.prompt_submitted) were removed on 2026-08-22
// because nothing fired them — they needed a client-side beacon endpoint that
// was never built. Aspirational names are not free: the privacy policy is
// written from this list, so a name that never fires makes the policy describe
// collection that doesn't happen. Add them back together with the beacon, and
// update app/legal/privacy in the same change.
export const EVENTS = {
  // Activation — the path the North Star measures.
  signedUp: "user.signed_up",
  projectCreated: "project.created",
  // Churn signal, and the counterweight to projectCreated: a funnel that only
  // counts creations reads as growth while people are deleting everything.
  projectDeleted: "project.deleted",
  buildStarted: "build.started",
  buildSucceeded: "build.succeeded",
  buildFailed: "build.failed",
  // Explicit thumbs up/down on a finished build — the only signal here that is
  // a direct statement of satisfaction rather than an inference from behaviour.
  buildRated: "build.rated",
  sitePublished: "project.published",

  // Monetization.
  creditsExhausted: "credits.exhausted",
  spendCapReached: "credits.cap_reached",
  checkoutStarted: "billing.checkout_started",
  creditsPurchased: "billing.credits_purchased",

  // Nxeon (domains / VPS / shared hosting) — a separate wallet from credits.
  nxeonLinked: "nxeon.linked",
  nxeonCheckoutStarted: "nxeon.checkout_started",
  nxeonOrderCompleted: "nxeon.order_completed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * The North Star: a user reaching their first PUBLISHED build. Not first
 * signup, not first generation — the moment the product delivered the thing
 * it promises, a real site at a real URL.
 */
export const NORTH_STAR: EventName = EVENTS.sitePublished;

type Props = Record<string, string | number | boolean | null | undefined>;

/**
 * Record an event. Deliberately fire-and-forget: analytics must never fail a
 * user's request or add latency to a build. A dropped event is a small gap in
 * a dashboard; a thrown one would be a failed generation.
 */
export function track(name: EventName, opts: { userId?: string | null; props?: Props } = {}): void {
  void db.event
    .create({
      data: {
        name,
        userId: opts.userId ?? null,
        props: opts.props ? (JSON.parse(JSON.stringify(opts.props)) as object) : undefined,
      },
    })
    .catch((err) => {
      // Log and move on — see above.
      console.error(`[events] failed to record ${name}:`, err);
    });
}

export type FunnelStep = { step: string; event: EventName; users: number; pctOfPrevious: number | null };

/**
 * Activation funnel: signup → first project → first successful build → first
 * publish, counted in DISTINCT USERS rather than events. Counting events would
 * let one enthusiastic user look like retention.
 */
export async function activationFunnel(sinceDays = 30): Promise<FunnelStep[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const steps: { step: string; event: EventName }[] = [
    { step: "Signed up", event: EVENTS.signedUp },
    { step: "Created a project", event: EVENTS.projectCreated },
    { step: "Built successfully", event: EVENTS.buildSucceeded },
    { step: "Published a site", event: EVENTS.sitePublished },
  ];

  const out: FunnelStep[] = [];
  let previous: number | null = null;

  for (const s of steps) {
    const rows = await db.event.findMany({
      where: { name: s.event, createdAt: { gte: since }, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    });
    const users = rows.length;
    out.push({
      ...s,
      users,
      pctOfPrevious: previous === null || previous === 0 ? null : Math.round((users / previous) * 1000) / 10,
    });
    previous = users;
  }

  return out;
}

/**
 * Green-build-first-try: the share of successful builds that compiled with no
 * repair attempt. A roadmap kill-criterion — the jump to backend work is meant
 * to be gated on it, and nothing measured it before `Build.repairAttempts`.
 */
export async function greenBuildRate(sinceDays = 30): Promise<{
  succeeded: number;
  firstTry: number;
  rate: number | null;
}> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const where = { status: "SUCCEEDED", createdAt: { gte: since } };

  const [succeeded, firstTry] = await Promise.all([
    db.build.count({ where }),
    db.build.count({ where: { ...where, repairAttempts: 0 } }),
  ]);

  return {
    succeeded,
    firstTry,
    rate: succeeded === 0 ? null : Math.round((firstTry / succeeded) * 1000) / 10,
  };
}

/**
 * What people ask for AFTER a build, ranked. This is the learning-mode
 * scoreboard: the top bucket is, in aggregate, what the first generation gets
 * wrong most often, and therefore what the next prompt change should target.
 *
 * Buckets come from a heuristic (lib/feedback-intent.ts) and are only
 * meaningful in aggregate — see the caveats in that file.
 */
export async function followUpIntents(
  sinceDays = 30,
): Promise<{ intent: string; count: number; pct: number }[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db.event.findMany({
    where: { name: EVENTS.buildStarted, createdAt: { gte: since } },
    select: { props: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const intent = (row.props as { intent?: unknown } | null)?.intent;
    // Absent on first builds, which have no follow-up to classify.
    if (typeof intent !== "string") continue;
    counts.set(intent, (counts.get(intent) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([intent, count]) => ({
      intent,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Thumbs up/down on finished builds. */
export async function buildRatings(sinceDays = 30): Promise<{
  up: number;
  down: number;
  rated: number;
  satisfaction: number | null;
}> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db.event.findMany({
    where: { name: EVENTS.buildRated, createdAt: { gte: since } },
    select: { props: true },
  });

  let up = 0;
  let down = 0;
  for (const row of rows) {
    const rating = (row.props as { rating?: unknown } | null)?.rating;
    if (rating === "up") up++;
    else if (rating === "down") down++;
  }

  const rated = up + down;
  return { up, down, rated, satisfaction: rated === 0 ? null : Math.round((up / rated) * 1000) / 10 };
}

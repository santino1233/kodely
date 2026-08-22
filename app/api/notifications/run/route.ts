import { createHash, timingSafeEqual } from "node:crypto";
import {
  previousSlot,
  scanBuildFailed,
  scanLowCredits,
  scanSitePublished,
  scanWelcome,
  SLOT_MS,
  type Slot,
} from "@/lib/notifications/scan";
import {
  sendBuildFailed,
  sendLowCredits,
  sendSitePublished,
  sendWelcome,
  type SendResult,
} from "@/lib/notifications/send";
import type { EmailKind } from "@/lib/notifications/templates";

export const dynamic = "force-dynamic";

// Cron-triggered notification run.
//
// Schedule it every 15 minutes, matching SLOT_MS in lib/notifications/scan.ts:
//
//   */15 * * * * curl -fsS -m 120 -X POST https://kodely.me/api/notifications/run \
//     -H "x-kodely-cron-secret: $KODELY_CRON_SECRET" >/dev/null
//
// Running it MORE often than every 15 minutes is harmless (each run processes
// the same closed slot and the dispatcher de-duplicates). Running it LESS
// often silently drops the slots nobody looked at.
//
// PROD ONLY. Staging shares neither the *.kodely.site wildcard nor prod's
// database, and the published-site URL this job builds is the prod one — see
// the note in sendSitePublished().

/** Never mail more than this in one run, per kind. A notification job that can
 *  address the entire user base needs a ceiling that is visible in the code:
 *  if a bug makes everyone eligible, the blast radius is this number and the
 *  cap shows up in the run's response instead of in everyone's inbox. */
const MAX_PER_KIND = 200;

/** A secret short enough to guess is not a secret; refuse rather than pretend. */
const MIN_SECRET_LENGTH = 16;

// 404, not 401. An unauthenticated caller learns nothing about whether this
// endpoint exists, which is the right answer for a route whose whole job is
// sending mail to other people.
function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function authorized(req: Request): boolean {
  const expected = process.env.KODELY_CRON_SECRET;
  // Unset means the endpoint is closed, never open.
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;

  // Header only — never a query parameter. Secrets in URLs end up in nginx
  // access logs, the CDN's logs, and any Referer that leaks out.
  const provided =
    req.headers.get("x-kodely-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided === "") return false;

  // Constant time, and over fixed-length digests so the comparison can't leak
  // the secret's length either.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function enabled(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

type KindReport = { due: number; sent: number; capped: number; skipped: Record<string, number> };

function emptyReport(): KindReport {
  return { due: 0, sent: 0, capped: 0, skipped: {} };
}

function record(report: KindReport, result: SendResult): void {
  if (result.sent) report.sent++;
  else report.skipped[result.reason] = (report.skipped[result.reason] ?? 0) + 1;
}

/**
 * Send one kind, sequentially and capped. Sequential on purpose: this is a
 * background job with no user waiting, and a single SMTP connection sending a
 * few hundred messages in a row is far kinder to the mail host (and to its
 * reputation) than a burst of parallel connections.
 */
async function run<T>(
  items: T[],
  sender: (item: T) => Promise<SendResult>,
): Promise<KindReport> {
  const report = emptyReport();
  report.due = items.length;
  const batch = items.slice(0, MAX_PER_KIND);
  report.capped = items.length - batch.length;
  for (const item of batch) record(report, await sender(item));
  return report;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return notFound();

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const slot: Slot = previousSlot();

  // Welcome is the one notification that also has a natural inline trigger
  // (the signup route). If that ever gets wired up, set this to 0 in the same
  // change so it isn't sent from both places.
  const wantWelcome = enabled("KODELY_NOTIFY_WELCOME_CRON", true);
  const wantLowCredits = enabled("KODELY_NOTIFY_LOW_CREDITS_CRON", true);
  const wantBuildFailed = enabled("KODELY_NOTIFY_BUILD_FAILED_CRON", true);
  const wantPublished = enabled("KODELY_NOTIFY_PUBLISHED_CRON", true);

  const [welcome, lowCredits, buildFailed, published] = await Promise.all([
    wantWelcome ? scanWelcome(slot) : [],
    wantLowCredits ? scanLowCredits(slot) : [],
    wantBuildFailed ? scanBuildFailed(slot) : [],
    wantPublished ? scanSitePublished(slot) : [],
  ]);

  const body: {
    slot: { start: string; end: string; minutes: number };
    dry: boolean;
    kinds: Partial<Record<EmailKind, KindReport>>;
  } = {
    slot: { start: slot.start.toISOString(), end: slot.end.toISOString(), minutes: SLOT_MS / 60000 },
    dry,
    kinds: {},
  };

  if (dry) {
    // Read-only rehearsal: what WOULD be sent, without touching SMTP or the
    // dedupe map. Counts only — this response carries no email addresses and
    // no account state, so a leaked cron log leaks nothing about anyone.
    body.kinds = {
      welcome: { ...emptyReport(), due: welcome.length },
      low_credits: { ...emptyReport(), due: lowCredits.length },
      build_failed: { ...emptyReport(), due: buildFailed.length },
      site_published: { ...emptyReport(), due: published.length },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  body.kinds.welcome = await run(welcome, (w) => sendWelcome(w.userId));
  body.kinds.low_credits = await run(lowCredits, (l) =>
    sendLowCredits(l.userId, l.crossingLedgerId),
  );
  body.kinds.build_failed = await run(buildFailed, (b) => sendBuildFailed(b.buildId));
  body.kinds.site_published = await run(published, (p) => sendSitePublished(p.projectId));

  const total = Object.values(body.kinds).reduce((sum, k) => sum + (k?.sent ?? 0), 0);
  console.log(
    `[notifications] slot ${body.slot.start} → ${body.slot.end}: sent ${total}`,
    body.kinds,
  );

  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

// GET is supported because plenty of cron/uptime runners only do GETs. It is
// not a safe/idempotent GET in the HTTP sense, but it is idempotent in the way
// that matters here: two GETs in the same slot send one set of emails.
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

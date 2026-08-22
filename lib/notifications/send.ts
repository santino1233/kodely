import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail";
import { getBalance, averageBuildCredits } from "@/lib/credits";
import { billingEnabled } from "@/lib/stripe";
import { creditState } from "./credit-state";
import {
  buildFailedEmail,
  lowCreditsEmail,
  sitePublishedEmail,
  supportReplyEmail,
  welcomeEmail,
  type Email,
  type EmailKind,
} from "./templates";

// The notification dispatcher.
//
// Two hard rules, both enforced structurally rather than by convention:
//
//   1. EVERY SEND IS ADDRESSED FROM THE DATABASE. No function here takes an
//      email address. You pass a userId / buildId / projectId, and the
//      recipient is looked up from that row's owner. It is therefore not
//      possible to call anything in this file in a way that mails one person
//      another person's account state.
//   2. NOTHING HERE CAN FAIL A REQUEST. Every send* function catches its own
//      errors and returns a result; the notify* wrappers don't even return a
//      promise. A dead SMTP server must never fail a build, a publish or a
//      signup.

// ── Transport ─────────────────────────────────────────────────────────────
//
// NOTE FOR THE OWNER OF lib/mail.ts — this is the one piece of duplication in
// this module and it should not survive. lib/mail.ts already builds and caches
// exactly this transporter, but keeps it module-private and exposes only
// sendContactEmail(), which always sends to CONTACT_TO. There is no exported
// way to send an arbitrary transactional message, and this module may not edit
// that file. So the transport below is deliberately built from THE SAME env
// vars, with the same secure/port logic and the same envelope sender, and the
// "is it configured" predicate is imported rather than re-implemented.
//
// The patch that deletes this block is ~6 lines in lib/mail.ts:
//
//   export async function sendMail(msg: nodemailer.SendMailOptions) {
//     await transporter().sendMail({ from: FROM, ...msg });
//   }
//
// Once that exists, import it here and delete `transport()` and `FROM`.

const FROM = process.env.MAIL_FROM ?? "Kodely <noreply@kodely.me>";
const PORT = Number(process.env.SMTP_PORT ?? 587);

let cached: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (!cached) {
    cached = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // The cron path sends in a loop; a hung SMTP connection must not wedge
      // the whole run. lib/mail.ts doesn't set these because its one caller is
      // a single interactive request.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return cached;
}

// ── Operational guards ────────────────────────────────────────────────────

/** Master off switch. Set KODELY_NOTIFY_DISABLED=1 to stop all sending. */
function disabled(): boolean {
  return process.env.KODELY_NOTIFY_DISABLED === "1";
}

/** Compose and log, never hand anything to SMTP. */
function dryRun(): boolean {
  return process.env.KODELY_NOTIFY_DRY_RUN === "1";
}

/**
 * Rollout safety net. With KODELY_NOTIFY_ALLOWLIST set to a comma-separated
 * list of addresses, everyone else is skipped. Turn this on first, watch real
 * mail arrive at your own address, then remove it.
 */
function allowlist(): Set<string> | null {
  const raw = process.env.KODELY_NOTIFY_ALLOWLIST;
  if (!raw) return null;
  const entries = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return entries.length > 0 ? new Set(entries) : null;
}

// ── Duplicate suppression, process-local ──────────────────────────────────
//
// This is the SECOND line of defence only. The real idempotency lives in
// lib/notifications/scan.ts, which derives each notification from a state
// transition that can only fall inside one cron slot. This map exists to make
// a retried or overlapping cron run (or a double-wired inline hook) a no-op
// within one process lifetime. It resets on deploy — same trade-off, and the
// same honest limitation, as the throttle in app/api/contact/route.ts.

const RECENT_TTL_MS = 6 * 60 * 60 * 1000;
const RECENT_MAX = 20_000;

const globalForNotify = globalThis as unknown as { kodelyNotifySent?: Map<string, number> };
const recent: Map<string, number> = (globalForNotify.kodelyNotifySent ??= new Map());

/**
 * True the first time a given (kind, dedupeKey) is seen, false afterwards.
 * The key must identify the *occurrence*, not the person: a ledger row id, a
 * build id, a project id — never just a userId for anything repeatable.
 */
function claim(kind: EmailKind, dedupeKey: string): boolean {
  const now = Date.now();
  if (recent.size > RECENT_MAX) {
    for (const [k, t] of recent) if (now - t > RECENT_TTL_MS) recent.delete(k);
    if (recent.size > RECENT_MAX) recent.clear();
  }
  const key = `${kind}:${dedupeKey}`;
  const seen = recent.get(key);
  if (seen !== undefined && now - seen < RECENT_TTL_MS) return false;
  recent.set(key, now);
  return true;
}

/** Undo a claim when the send didn't actually happen, so a retry can try again. */
function release(kind: EmailKind, dedupeKey: string): void {
  recent.delete(`${kind}:${dedupeKey}`);
}

// ── Delivery ──────────────────────────────────────────────────────────────

export type SendResult = {
  sent: boolean;
  kind: EmailKind;
  /** Machine-readable outcome: "sent", "not_configured", "duplicate", ... */
  reason: string;
};

async function deliver(to: string, email: Email): Promise<void> {
  if (dryRun()) {
    console.log(`[notifications] DRY RUN — would send "${email.subject}" to ${to}`);
    return;
  }
  await transport().sendMail({
    from: FROM,
    // The bare address, never `Name <addr>`: a display name is user-supplied
    // and a CR/LF in it would be header injection (see headerSafe in
    // lib/mail.ts). Nothing user-controlled reaches a header from here.
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

/**
 * Shared shell for every notification: guards, recipient resolution, dedupe,
 * delivery, and the promise that nothing throws.
 *
 * `build` returns null to abstain — used by every caller to re-check its own
 * precondition against the database immediately before sending, so a stale
 * scan result can never turn into a wrong email.
 */
async function send(
  kind: EmailKind,
  dedupeKey: string,
  build: () => Promise<{ to: string; email: Email } | null>,
): Promise<SendResult> {
  const done = (sent: boolean, reason: string): SendResult => ({ sent, kind, reason });

  try {
    if (disabled()) return done(false, "disabled");
    if (!isMailConfigured() && !dryRun()) return done(false, "not_configured");
    if (!claim(kind, dedupeKey)) return done(false, "duplicate");

    let target: { to: string; email: Email } | null = null;
    try {
      target = await build();
    } catch (err) {
      release(kind, dedupeKey);
      console.error(`[notifications] ${kind} lookup failed for ${dedupeKey}:`, err);
      return done(false, "lookup_failed");
    }

    if (!target) {
      // Precondition no longer holds — a real "don't send", so keep the claim.
      return done(false, "precondition_failed");
    }

    const allowed = allowlist();
    if (allowed && !allowed.has(target.to.toLowerCase())) {
      return done(false, "not_allowlisted");
    }

    try {
      await deliver(target.to, target.email);
    } catch (err) {
      release(kind, dedupeKey);
      // Never log the message body or the recipient's other account state.
      console.error(`[notifications] ${kind} delivery failed:`, err);
      return done(false, "delivery_failed");
    }

    return done(true, dryRun() ? "dry_run" : "sent");
  } catch (err) {
    // Belt and braces: this function is called from fire-and-forget paths and
    // must not be able to reject.
    console.error(`[notifications] ${kind} failed unexpectedly:`, err);
    return done(false, "error");
  }
}

// ── 1. Welcome ────────────────────────────────────────────────────────────

/**
 * Sent once, right after an account is created. Idempotent on the user row
 * itself: an account is created exactly once, and the age guard below means a
 * stray second call an hour later does nothing even after a restart clears the
 * in-process claim.
 */
const WELCOME_MAX_AGE_MS = 60 * 60 * 1000;

export async function sendWelcome(userId: string): Promise<SendResult> {
  return send("welcome", userId, async () => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, createdAt: true },
    });
    if (!user?.email) return null;
    if (Date.now() - user.createdAt.getTime() > WELCOME_MAX_AGE_MS) return null;
    return { to: user.email, email: welcomeEmail({ name: user.name }) };
  });
}

// ── 2. Low credits ────────────────────────────────────────────────────────

/**
 * The balance warning. `crossingLedgerId` is the ledger row that took this
 * user below the line — it is the dedupe key, so one crossing produces one
 * email no matter how many times this is called. See scanLowCredits().
 */
export async function sendLowCredits(userId: string, crossingLedgerId: string): Promise<SendResult> {
  return send("low_credits", crossingLedgerId, async () => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) return null;

    // Re-read the balance at send time: they may have topped up between the
    // scan and now, and "you're running low" to someone who just paid is the
    // worst possible version of this email.
    const [balance, avg, chargedBuilds] = await Promise.all([
      getBalance(userId),
      averageBuildCredits(userId),
      // Whether `avg` is their own measured number or the global fallback —
      // the same condition averageBuildCredits() uses to decide. The email
      // claims one or the other, so it has to know which.
      db.build.count({
        where: { project: { userId }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
      }),
    ]);
    const state = creditState(balance, avg);
    if (!state.needsWarning) return null;

    return {
      to: user.email,
      email: lowCreditsEmail({
        balance: state.balance,
        avgBuildCredits: state.avgBuildCredits,
        canTopUp: billingEnabled(),
        measured: chargedBuilds > 0,
        state,
      }),
    };
  });
}

// ── 3. Build failed ───────────────────────────────────────────────────────

export async function sendBuildFailed(buildId: string): Promise<SendResult> {
  return send("build_failed", buildId, async () => {
    const build = await db.build.findUnique({
      where: { id: buildId },
      select: {
        status: true,
        error: true,
        creditsCharged: true,
        project: { select: { id: true, name: true, user: { select: { email: true } } } },
      },
    });
    if (!build || build.status !== "FAILED") return null;
    if (!build.project.user.email) return null;

    // The email states plainly that they were not charged. Only say it if the
    // ledger agrees: creditsCharged is 0 on the build AND no ledger row points
    // at it. app/api/generate/route.ts never charges a failed build, so this
    // should always hold — but this is a factual claim about someone's money,
    // and it gets verified rather than assumed.
    if (build.creditsCharged !== 0) return null;
    const charged = await db.creditLedger.count({ where: { buildId } });
    if (charged > 0) return null;

    return {
      to: build.project.user.email,
      email: buildFailedEmail({ projectName: build.project.name, projectId: build.project.id }),
    };
  });
}

// ── 4. Site published ─────────────────────────────────────────────────────

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

export async function sendSitePublished(projectId: string): Promise<SendResult> {
  return send("site_published", projectId, async () => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        publishedAt: true,
        user: { select: { email: true } },
      },
    });
    if (!project?.publishedAt || !project.user.email) return null;

    return {
      to: project.user.email,
      email: sitePublishedEmail({
        projectName: project.name,
        projectId: project.id,
        // Matches the URL app/api/projects/[id]/publish/route.ts returns on
        // prod. Staging publishes to a path-based URL derived from the request
        // host, which a background job can't know — which is why the cron for
        // this one is meant to run on prod only (see the route).
        siteUrl: `https://${project.slug}.${SITES_BASE}`,
      }),
    };
  });
}

// ── 5. Support reply ──────────────────────────────────────────────────────

/**
 * An operator answered a ticket.
 *
 * `messageId` is the SupportMessage that was just written, which makes it the
 * occurrence and therefore the dedupe key — the same discipline as buildId and
 * the crossing ledger row above, and the reason two overlapping calls produce
 * one email.
 *
 * THE EMAIL IS A NOTIFICATION, NOT THE MECHANISM. The reply is already in the
 * customer's thread on /support the instant the transaction commits; this only
 * tells them to go and look. Everything below therefore fails soft, and with
 * mail unconfigured the whole feature still works — see the note on the
 * support page, which says so to the customer rather than leaving them to find
 * out.
 *
 * Rule 1 of this module still holds: no address is passed in. The recipient is
 * resolved from the ticket's owner, so this cannot be called in a way that
 * mails one person another person's support thread.
 */
export async function sendSupportReply(messageId: string): Promise<SendResult> {
  return send("support_reply", messageId, async () => {
    const message = await db.supportMessage.findUnique({
      where: { id: messageId },
      select: {
        author: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            subject: true,
            customerReadAt: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    // A customer's own message must never trigger a mail back to themselves.
    if (!message || message.author !== "STAFF") return null;
    const { ticket } = message;
    if (!ticket.user.email) return null;

    // They have already read it in the app — between the reply landing and
    // this running, someone had the thread open. Telling them to go and read
    // something they just read is the small kind of wrong that makes people
    // stop trusting notifications.
    if (ticket.customerReadAt !== null && ticket.customerReadAt >= message.createdAt) return null;

    return {
      to: ticket.user.email,
      email: supportReplyEmail({ subject: ticket.subject, ticketId: ticket.id }),
    };
  });
}

// ── Fire-and-forget wrappers ──────────────────────────────────────────────
//
// These are the ones to call from request paths. They return void, never a
// promise, so there is no await to forget and no rejection to handle: a
// notification physically cannot delay or fail the request that triggered it.
//
// Nothing calls them yet — the routes that would (signup, generate, publish)
// are owned by other modules and this module may not edit them. Each is a
// single line at the call site:
//
//   app/api/auth/signup/route.ts        notifyWelcome(user.id)
//   app/api/auth/google/callback        notifyWelcome(user.id)   [new users only]
//   app/api/generate/route.ts           notifyBuildFailed(build.id)
//   app/api/projects/[id]/publish       notifySitePublished(id)
//
// Wiring notifyWelcome means the cron no longer should: set
// KODELY_NOTIFY_WELCOME_CRON=0 in the same change. The other two are safe to
// wire with the cron still running — the same claim key is used on both paths
// within a process, and the cron's own scan only looks at closed slots.

function fireAndForget(work: Promise<SendResult>): void {
  void work.catch((err) => console.error("[notifications] unreachable:", err));
}

export function notifyWelcome(userId: string): void {
  fireAndForget(sendWelcome(userId));
}

export function notifyLowCredits(userId: string, crossingLedgerId: string): void {
  fireAndForget(sendLowCredits(userId, crossingLedgerId));
}

export function notifyBuildFailed(buildId: string): void {
  fireAndForget(sendBuildFailed(buildId));
}

export function notifySitePublished(projectId: string): void {
  fireAndForget(sendSitePublished(projectId));
}

/**
 * Wired, unlike the four above: app/admin/support/actions.ts calls this the
 * moment a reply is committed. It is deliberately OUTSIDE that transaction —
 * a dead SMTP server must never roll back a reply the customer can already
 * read on their thread.
 */
export function notifySupportReply(messageId: string): void {
  fireAndForget(sendSupportReply(messageId));
}

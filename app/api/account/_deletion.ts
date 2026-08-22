import { db } from "@/lib/db";

// ── Self-service account deletion (an erasure request) ────────────────────
//
// Two things make this file longer than "delete the user row" — both of them
// deliberate.
//
// WHY THIS IS A REQUEST WITH A GRACE PERIOD, NOT A BUTTON. Erasure here is
// irreversible: there is no soft-delete column anywhere in the schema and no
// backup restore path a support agent could reach for. A single click that
// destroys someone's work is also a single click an attacker who has stolen a
// session can make on their behalf. So a request is recorded, the account
// keeps working untouched, the owner is emailed, and nothing is destroyed
// until a second, explicit confirmation after DELETION_GRACE_DAYS.
//
// WHY THE USER ROW SURVIVES ERASURE. `CreditLedger.userId` is
// ON DELETE CASCADE, so `db.user.delete()` takes the ledger with it. Three
// concrete things break if it does:
//
//   1. lib/retention.ts NEVER_PRUNED commits, in writing, that the ledger is
//      "an auditable financial record ... Retained permanently", and every
//      balance in the product is derived from it rather than stored.
//   2. app/api/rewards/_lib.ts enforces one reward grant per EXTERNAL account
//      by scanning ledger `reason` strings across all users
//      (identityAlreadyUsed). Cascading those rows away makes "delete the
//      account, sign up again, reconnect the same Discord" an unlimited credit
//      farm — real model spend, roughly $0.40 an account, minted by a loop.
//   3. Purchase rows carry `stripe:<checkout_session_id>`, which is the record
//      of money actually received.
//
// So erasure destroys every piece of personal content and STRIPS the account
// row down to a tombstone — no email, no name, no Google id, no Stripe
// customer id, no password — leaving the ledger attached to an id that no
// longer resolves to a person. The rows that remain are a delta, a reason, a
// balance and a timestamp.
//
// The right long-term fix is a schema change this file is not allowed to make:
// `CreditLedger.userId` should be nullable and ON DELETE SET NULL, exactly as
// `CreditLedger.buildId` already is, at which point the User row can genuinely
// be deleted and the ledger simply detaches. See the report.

/**
 * How long a request sits before it can be carried out.
 *
 * Long enough that a rash decision, or one made from a session someone else
 * controls, can be caught and cancelled — the owner is emailed the moment a
 * request is made. Short enough that "we will delete your account" does not
 * read as a stall.
 */
export const DELETION_GRACE_DAYS = 7;

/** Typed by the user at BOTH steps. Case-sensitive, and deliberately not the word "yes". */
export const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export const PRIVACY_EMAIL = "privacy@kodely.me";

// ── Where the request is stored ───────────────────────────────────────────
//
// In SupportNote, as marker-prefixed rows. This needs explaining, because it
// is not what that table was built for.
//
// There is no `User.deletionRequestedAt` column and this change is not allowed
// to add one. The alternatives were weighed:
//
//   * CreditLedger delta-0 rows — the pattern app/api/rewards/_lib.ts already
//     uses for pending claims. Rejected: account lifecycle is not money, and
//     the row would surface in the customer's own billing history.
//   * The Event table — explicitly rejected by its own contract (lib/events.ts:
//     a closed vocabulary the privacy policy is written from) and by the same
//     reasoning in lib/rate-limit.ts.
//   * EmailLog — its unique (kind, dedupeKey) means a cancelled request could
//     never be re-made.
//
// SupportNote is the only per-user, timestamped, append-only table left, and a
// deletion request is a thing an operator genuinely should see when they open
// an account. The cost, stated plainly: these rows appear in the operator-notes
// UI, which labels itself "operator-written, never customer-facing", and one
// of them is neither. A `deletionRequestedAt` column removes the whole
// awkwardness and is the recommended follow-up.
//
// State is the LATEST marker row, the way the reward state machine is the
// latest matching ledger row. Nothing is ever updated or deleted to change
// state; a cancellation is a new row.

const MARKER_REQUESTED = "[deletion-requested]";
const MARKER_CANCELLED = "[deletion-cancelled]";
const MARKER_COMPLETED = "[deletion-completed]";

const MARKERS = [MARKER_REQUESTED, MARKER_CANCELLED, MARKER_COMPLETED];

export type DeletionStatus =
  | { state: "none" }
  | {
      /** Requested; the grace period is still running. Cancellable. */
      state: "pending";
      requestedAt: Date;
      scheduledFor: Date;
      hoursLeft: number;
    }
  | {
      /** Grace period elapsed. One confirmation away from erasure. Still cancellable. */
      state: "due";
      requestedAt: Date;
      scheduledFor: Date;
    }
  | { state: "erased"; erasedAt: Date };

function scheduledFrom(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
}

/**
 * The current state of this account's deletion request, if any.
 *
 * Scoped by userId in the same query as everything else it filters on, so it
 * can never read another account's markers.
 */
export async function deletionStatus(userId: string): Promise<DeletionStatus> {
  const latest = await db.supportNote.findFirst({
    where: { userId, OR: MARKERS.map((marker) => ({ body: { startsWith: marker } })) },
    // Id breaks a timestamp tie. Cancelling and immediately re-requesting can
    // land two markers in the same millisecond, and "latest wins" has to mean
    // something definite when it does — cuids sort by generation time, so the
    // newer row wins either way round.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { body: true, createdAt: true },
  });

  if (!latest) return { state: "none" };

  if (latest.body.startsWith(MARKER_COMPLETED)) {
    return { state: "erased", erasedAt: latest.createdAt };
  }
  if (latest.body.startsWith(MARKER_CANCELLED)) return { state: "none" };

  const requestedAt = latest.createdAt;
  const scheduledFor = scheduledFrom(requestedAt);
  const msLeft = scheduledFor.getTime() - Date.now();
  if (msLeft <= 0) return { state: "due", requestedAt, scheduledFor };

  return {
    state: "pending",
    requestedAt,
    scheduledFor,
    // Computed server-side so the page renders the same number on the server
    // and on hydration, the way rewardStatuses does it.
    hoursLeft: Math.ceil(msLeft / 3_600_000),
  };
}

/**
 * What erasure would destroy, counted before it happens.
 *
 * Shown in the confirmation UI. A dialog that says "this cannot be undone"
 * without saying what "this" is asks for consent to something unstated.
 */
export type DeletionPreview = {
  projects: number;
  liveSites: number;
  files: number;
  messages: number;
  builds: number;
  sessions: number;
  analyticsEvents: number;
  supportNotes: number;
  /** Threads the customer opened on /support. Their words, so they go. */
  supportTickets: number;
  /** Every turn in those threads, both sides of the conversation. */
  supportMessages: number;
  emailsSent: number;
  /** Retained, not destroyed. */
  creditLedgerRows: number;
  creditBalance: number;
};

export async function deletionPreview(userId: string): Promise<DeletionPreview> {
  const [
    projects,
    liveSites,
    files,
    messages,
    builds,
    sessions,
    analyticsEvents,
    supportNotes,
    supportTickets,
    supportMessages,
    emailsSent,
    creditLedgerRows,
    newestLedgerRow,
  ] = await Promise.all([
    db.project.count({ where: { userId } }),
    db.project.count({ where: { userId, publishedAt: { not: null } } }),
    db.projectFile.count({ where: { project: { userId } } }),
    db.message.count({ where: { project: { userId } } }),
    db.build.count({ where: { project: { userId } } }),
    db.session.count({ where: { userId } }),
    db.event.count({ where: { userId } }),
    // The markers this module writes live in the same table, so they are
    // excluded from the count a person is shown — otherwise requesting
    // deletion would appear to create a support note about themselves.
    // NOT wraps a single OR rather than taking an array: `NOT: [a, b]` means
    // NOT(a AND b), which is vacuously true here because no body can start
    // with two markers at once — it would silently filter nothing.
    db.supportNote.count({
      where: { userId, NOT: { OR: MARKERS.map((marker) => ({ body: { startsWith: marker } })) } },
    }),
    // Support tickets are the customer's own words, not prose about them, so
    // unlike the marker rows above there is nothing here to filter out.
    db.supportTicket.count({ where: { userId } }),
    db.supportMessage.count({ where: { ticket: { userId } } }),
    db.emailLog.count({ where: { userId } }),
    db.creditLedger.count({ where: { userId } }),
    db.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { balanceAfter: true },
    }),
  ]);

  return {
    projects,
    liveSites,
    files,
    messages,
    builds,
    sessions,
    analyticsEvents,
    supportNotes,
    supportTickets,
    supportMessages,
    emailsSent,
    creditLedgerRows,
    creditBalance: newestLedgerRow?.balanceAfter ?? 0,
  };
}

/** Record a request. Destroys nothing. */
export async function requestDeletion(
  userId: string,
  requesterEmail: string,
): Promise<{ ok: true; status: DeletionStatus } | { ok: false; reason: "already_open" | "erased" }> {
  const current = await deletionStatus(userId);
  if (current.state === "erased") return { ok: false, reason: "erased" };
  if (current.state !== "none") return { ok: false, reason: "already_open" };

  const scheduledFor = scheduledFrom(new Date());

  await db.supportNote.create({
    data: {
      userId,
      // Every other row in this table is written by an operator. This one is
      // written by the account holder, and says so rather than borrowing a
      // staff address it did not come from.
      authorEmail: requesterEmail,
      body:
        `${MARKER_REQUESTED} The account holder requested deletion of this account from ` +
        `/legal/rights. Nothing is deleted before ${scheduledFor.toISOString()}, and the ` +
        `request can be cancelled by the account holder until it is carried out.`,
    },
  });

  return { ok: true, status: await deletionStatus(userId) };
}

/** Withdraw an open request. */
export async function cancelDeletion(userId: string): Promise<boolean> {
  const current = await deletionStatus(userId);
  if (current.state !== "pending" && current.state !== "due") return false;

  await db.supportNote.create({
    data: {
      userId,
      authorEmail: PRIVACY_EMAIL,
      body: `${MARKER_CANCELLED} The account holder cancelled their deletion request. Nothing was deleted.`,
    },
  });
  return true;
}

/** What erasure actually did. Returned to the user, and worth keeping in a log. */
export type ErasureReceipt = {
  erasedAt: string;
  projectsDeleted: number;
  liveSitesWithdrawn: number;
  filesDeleted: number;
  messagesDeleted: number;
  buildsDeleted: number;
  sessionsEnded: number;
  analyticsEventsDetached: number;
  supportNotesDeleted: number;
  supportTicketsDeleted: number;
  supportMessagesDeleted: number;
  emailRecordsDeleted: number;
  creditLedgerRowsRetained: number;
  moderationFindingsRetained: number;
};

/**
 * Carry out the erasure. Irreversible.
 *
 * Everything happens in one transaction: an account half-erased — projects
 * gone but the email still on file, or the reverse — is worse than either
 * outcome. The timeout is raised well above Prisma's 5s default because
 * deleting projects cascades file trees and build snapshots, which is the
 * slowest write in the product.
 *
 * Callers MUST have checked `deletionStatus` is "due" first; this function
 * does not re-check, so that the routes own the policy and this owns the
 * mechanics.
 */
export async function eraseAccount(userId: string): Promise<ErasureReceipt> {
  const before = await deletionPreview(userId);
  const erasedAt = new Date();

  const moderationFindingsRetained = await (async () => {
    const projects = await db.project.findMany({ where: { userId }, select: { id: true } });
    if (projects.length === 0) return 0;
    // ModerationFinding has no relation to Project in the schema, so it is not
    // cascaded by anything and cannot be scoped by a relation filter. It is
    // also deliberately NOT deleted — see the note below the transaction.
    return db.moderationFinding.count({
      where: { projectId: { in: projects.map((p) => p.id) } },
    });
  })();

  await db.$transaction(
    async (tx) => {
      // Support threads go FIRST, before projects, and the order is not
      // arbitrary. SupportTicket.projectId is ON DELETE SET NULL, so deleting
      // the projects first would make Postgres walk every ticket to blank a
      // column on rows that are about to be deleted anyway. Doing it this way
      // round the tickets simply go, and their messages go with them
      // (SupportMessage cascades from the ticket).
      //
      // They are DELETED rather than detached, unlike analytics events: a
      // ticket is a conversation the person wrote in their own words about
      // their own account, and there is no aggregate anywhere that needs the
      // rows to survive. Nothing in the product reads a ticket that has no
      // owner, and a queue holding threads from an erased account would be a
      // pile of personal data with nobody left to answer.
      await tx.supportTicket.deleteMany({ where: { userId } });

      // Projects first. This is what takes a published site offline: the
      // cascade removes the `published: true` rows the public site route
      // serves AND the Project row it resolves the slug by, so
      // <slug>.kodely.site 404s. An already-cached page can survive up to a
      // minute at the CDN, which is the same caveat project deletion carries.
      //
      // The cascade also removes ProjectFile, Message and Build (including
      // every prompt and every filesSnapshot). CreditLedger.buildId is
      // ON DELETE SET NULL, so ledger rows survive with buildId cleared —
      // exactly what deleting a project already does today.
      await tx.project.deleteMany({ where: { userId } });

      // Signed out everywhere, immediately.
      await tx.session.deleteMany({ where: { userId } });

      // Operator notes are prose written about a real person. Erasure is
      // precisely the moment they should go — including the marker rows this
      // module wrote, which is why the tombstone below is created afterwards.
      await tx.supportNote.deleteMany({ where: { userId } });

      // "We emailed this person" is a record about the person. Its only
      // function is exactly-once delivery, and nothing can be delivered to an
      // erased account: every notification in lib/notifications is triggered
      // by activity inside a 15-minute slot, and an erased account produces
      // none.
      await tx.emailLog.deleteMany({ where: { userId } });

      // Detached, not deleted — the behaviour the schema already declares
      // (Event.userId is ON DELETE SET NULL) and the privacy policy already
      // describes. Done explicitly because the User row is not being deleted.
      await tx.event.updateMany({ where: { userId }, data: { userId: null } });

      // The tombstone. Every identifier is destroyed; what remains is a row id
      // that the credit ledger's foreign key needs in order to exist.
      //
      // `.invalid` is reserved by RFC 2606 and can never be a real address, so
      // the placeholder can neither collide with a future signup nor receive
      // mail. With passwordHash and googleId null there is no way to sign in
      // as it, and the role is dropped to CUSTOMER so an erased administrator
      // cannot leave privileges behind.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          name: `Deleted account (erased ${erasedAt.toISOString()})`,
          passwordHash: null,
          googleId: null,
          stripeCustomerId: null,
          spendCapCredits: null,
          role: "CUSTOMER",
          // Nxeon identifiers are as personal as googleId — a server IP, a
          // registered domain and a hosting account id all identify the
          // erased person, and nxeonUserId being @unique means leaving it set
          // would also permanently block them from ever re-linking that same
          // Nxeon account to a fresh signup.
          nxeonUserId: null,
          nxeonServerId: null,
          nxeonServerIp: null,
          nxeonServerHostname: null,
          nxeonDomain: null,
          nxeonDomainExpiresAt: null,
          nxeonHostingAccountId: null,
          nxeonHostingDomain: null,
        },
      });

      await tx.supportNote.create({
        data: {
          userId,
          authorEmail: PRIVACY_EMAIL,
          body:
            `${MARKER_COMPLETED} Account erased at the holder's request on ` +
            `${erasedAt.toISOString()}. Projects, files, messages, builds, sessions, support ` +
            `tickets, operator notes and email records were deleted; analytics events were ` +
            `detached; the credit ` +
            `ledger was retained as a financial and anti-fraud record. Nothing in this row ` +
            `identifies a person. See /legal/rights.`,
        },
      });
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  return {
    erasedAt: erasedAt.toISOString(),
    projectsDeleted: before.projects,
    liveSitesWithdrawn: before.liveSites,
    filesDeleted: before.files,
    messagesDeleted: before.messages,
    buildsDeleted: before.builds,
    sessionsEnded: before.sessions,
    analyticsEventsDetached: before.analyticsEvents,
    supportNotesDeleted: before.supportNotes,
    supportTicketsDeleted: before.supportTickets,
    supportMessagesDeleted: before.supportMessages,
    emailRecordsDeleted: before.emailsSent,
    creditLedgerRowsRetained: before.creditLedgerRows,
    // Retained on purpose. A moderation finding is the record of why a publish
    // was blocked — a phishing login form, a wallet-drainer prompt. If erasure
    // destroyed them, requesting deletion would be a way to delete the
    // evidence of an abuse attempt and start again clean. They are keyed by a
    // project id that no longer resolves to anything, so what is left does not
    // identify a person.
    moderationFindingsRetained,
  };
}

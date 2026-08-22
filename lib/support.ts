import { Prisma } from "@prisma/client";
import { db } from "./db";

// The support-ticket vocabulary and the two or three queries that have to mean
// the same thing on both sides of the product.
//
// It lives here, and not in either page, for the reason lib/admin-audit.ts
// gives for the same choice: the customer's /support and the operator's
// /admin/support read the SAME rows and have to agree about what "answered"
// means, what counts as unread, and which categories exist. Two copies of that
// would disagree in the direction of the customer being told one thing and the
// operator seeing another, which is the single worst failure available to a
// support inbox.
//
// Nothing in this file renders anything. Labels are here because they are part
// of the vocabulary — the word the customer reads and the word the operator
// filters by are the same word by construction.

// ── Status ────────────────────────────────────────────────────────────────
//
// Three values, and the test each one had to pass to be here: EITHER a human
// actually sets it, OR the system can derive it from something that really
// happened. Nothing aspirational.
//
//   OPEN      — the customer wrote last and nobody has answered. Derived: it
//               is set by the act of the customer sending anything.
//   ANSWERED  — staff wrote last. Derived: set by the act of an operator
//               replying. The ball is with the customer.
//   RESOLVED  — done. The ONE status a human types, and either side may set
//               it: the customer closing their own ticket is a real thing
//               people do, and refusing them the button only produces a queue
//               full of threads nobody will admit are finished.
//
// What was deliberately left out, and why, because a status list grows by
// accident otherwise:
//   * "pending" / "waiting on customer" — that is ANSWERED. A second word for
//     it would split the same state across two filters.
//   * "escalated", "priority", "urgent" — nothing escalates anything here.
//     There is one inbox and no tier to escalate to, so the field could only
//     ever be decoration a customer might reasonably read as a promise.
//   * "closed" as distinct from "resolved" — a distinction with no mechanism
//     behind it. Reopening is just replying, which sets OPEN again.
export const SUPPORT_STATUSES = ["OPEN", "ANSWERED", "RESOLVED"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

type StatusInfo = {
  /** What the customer reads on their own ticket. */
  customerLabel: string;
  /** What the operator reads in the queue. Same state, the other point of view. */
  staffLabel: string;
  /** One sentence, said in the customer's voice, about whose turn it is. */
  customerHint: string;
};

export const SUPPORT_STATUS_INFO: Record<SupportStatus, StatusInfo> = {
  OPEN: {
    customerLabel: "Waiting on us",
    staffLabel: "Needs a reply",
    customerHint: "You wrote last. Nobody has replied yet.",
  },
  ANSWERED: {
    customerLabel: "Replied",
    staffLabel: "Answered",
    customerHint: "We replied. Reply again if it is not sorted.",
  },
  RESOLVED: {
    customerLabel: "Resolved",
    staffLabel: "Resolved",
    customerHint: "Marked resolved. Replying reopens it.",
  },
};

/**
 * hasOwnProperty, never `in`: `in` walks the prototype chain, so `?status=
 * toString` would pass a guard whose whole job is to say this word is one of
 * OURS — and the caller would then index the record with it. Same reasoning,
 * and same fix, as isAdminAction in lib/admin-audit.ts.
 */
export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUPPORT_STATUS_INFO, value);
}

// ── Category ──────────────────────────────────────────────────────────────
//
// Four, chosen by "would a person actually pick this about their own problem"
// rather than by how we would like the queue sorted. Every one of them routes
// to a different first question:
//
//   bug      → what did you expect, what happened, on which site
//   feature  → what do you want to be able to do (and nothing else; asking a
//              feature request for reproduction steps is how you teach people
//              not to send them)
//   billing  → credits, charges, a balance that moved
//   help     → "how do I…". The default, and the catch-all, so nobody is ever
//              forced to mis-file a question to get it sent.
//
// No "other": a category list whose last entry is "other" collects half the
// tickets there, and `help` already does that job honestly.
export const SUPPORT_CATEGORIES = ["bug", "feature", "billing", "help"] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  bug: "Something is broken",
  feature: "An idea or a request",
  billing: "Credits or a charge",
  help: "Help using Kodely",
};

/** The short form, for a queue column where the sentence above is too wide. */
export const SUPPORT_CATEGORY_SHORT: Record<SupportCategory, string> = {
  bug: "Bug",
  feature: "Idea",
  billing: "Billing",
  help: "Help",
};

export const DEFAULT_SUPPORT_CATEGORY: SupportCategory = "help";

export function isSupportCategory(value: unknown): value is SupportCategory {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(SUPPORT_CATEGORY_LABELS, value)
  );
}

/** Falls back to the raw string, so a value written before a category existed
    is still legible rather than rendering blank. */
export function categoryLabel(value: string): string {
  return isSupportCategory(value) ? SUPPORT_CATEGORY_LABELS[value] : value;
}

export function categoryShort(value: string): string {
  return isSupportCategory(value) ? SUPPORT_CATEGORY_SHORT[value] : value;
}

// ── ?topic= ───────────────────────────────────────────────────────────────
//
// components/app/SidebarFooter.tsx links at /support?topic=bug and
// /support?topic=feature from the "Bug or idea" menu. This is the closed table
// that turns that query string into a category and a starting point.
//
// It is a SEPARATE vocabulary from the categories on purpose: `topic` is a URL
// contract with the rail, and the categories are the product's own. Keeping
// them separate means renaming a category never breaks a link somebody has
// bookmarked, and adding a category never silently creates a new public URL.

export type SupportTopic = {
  category: SupportCategory;
  /** Replaces the composer's normal heading when they arrive this way. */
  heading: string;
  intro: string;
};

const TOPICS: Record<string, SupportTopic> = {
  bug: {
    category: "bug",
    heading: "Report a bug",
    intro:
      "Three things get this fixed fastest, and they are the three we would otherwise have to write back and ask for.",
  },
  feature: {
    category: "feature",
    heading: "Request a feature",
    intro:
      "What do you want to be able to do? Say what you were trying to get done — the problem is more useful to us than the solution.",
  },
};

/**
 * Resolve `?topic=` to a starting point, or null.
 *
 * hasOwnProperty rather than `x in TOPICS`, for the reason given on
 * isSupportStatus: `?topic=constructor` must be an unrecognised topic, not a
 * Function handed to the composer. An unrecognised value returns null and the
 * page renders normally — a bad query string is not an error condition, and it
 * must never render a category that does not exist.
 */
export function supportTopic(value: string | string[] | undefined): SupportTopic | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  return Object.prototype.hasOwnProperty.call(TOPICS, raw) ? TOPICS[raw] : null;
}

// ── What the composer asks for, per category ──────────────────────────────
//
// Keyed by CATEGORY rather than by topic, deliberately: someone who arrives at
// /support?topic=bug and someone who picks "Something is broken" from the list
// are filing the same thing and must be asked the same questions. Hanging this
// off the topic instead would have produced two versions of a bug report,
// which is how a queue ends up with half its rows missing the one field
// everybody needs.

export type CategoryGuidance = {
  /**
   * Pre-filled into the body. HEADINGS ONLY — never a sentence written in the
   * customer's voice that they might send without noticing. Only `bug` has
   * one: the three lines below are the three we always have to write back and
   * ask for. A feature request deliberately gets none, because asking an idea
   * for reproduction steps is how you train people out of sending ideas.
   */
  scaffold: string;
  bodyHint: string;
  /** What the site picker says. A bug wants one; an idea usually is not about one. */
  siteHint: string;
};

export const SUPPORT_CATEGORY_GUIDANCE: Record<SupportCategory, CategoryGuidance> = {
  bug: {
    scaffold: "What I expected:\n\n\nWhat happened instead:\n\n\nAnything I already tried:\n",
    bodyHint: "Replace each line. Rough is fine — the exact wording of any error helps most.",
    siteHint:
      "Pick the site it happened on. Its name and address go with the ticket, so nobody has to ask you for them.",
  },
  feature: {
    scaffold: "",
    bodyHint: "What you were trying to do, and what got in the way.",
    siteHint: "Only if the idea is about one particular site. Most are not.",
  },
  billing: {
    scaffold: "",
    bodyHint:
      "Which charge or which credits, and roughly when. Your credit history has every line in it.",
    siteHint: "Only if it is about the builds on one site.",
  },
  help: {
    scaffold: "",
    bodyHint: "What you are trying to do, and where you got stuck.",
    siteHint: "Attach a site if it is about one — it saves a round trip.",
  },
};

export function guidanceFor(category: string): CategoryGuidance {
  return isSupportCategory(category)
    ? SUPPORT_CATEGORY_GUIDANCE[category]
    : SUPPORT_CATEGORY_GUIDANCE[DEFAULT_SUPPORT_CATEGORY];
}

// ── Limits ────────────────────────────────────────────────────────────────
//
// Both are enforced on the server, in the actions, and mirrored into the
// textarea's maxLength so the browser stops people before the round trip.

export const SUBJECT_MAX = 120;
export const BODY_MAX = 5000;
/** Below the composer's own cap so a scaffold can never be what pushes a real
    message over the line. */
export const BODY_MIN = 2;

// ── Rows, as the two UIs need them ────────────────────────────────────────

export type TicketAuthor = "CUSTOMER" | "STAFF";

/** One ticket as either list renders it. Deliberately no message bodies. */
export type TicketSummary = {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: Date;
  lastMessageAt: Date;
  lastStaffMessageAt: Date | null;
  customerReadAt: Date | null;
  staffReadAt: Date | null;
  messageCount: number;
  project: { id: string; name: string } | null;
};

export type TicketMessage = {
  id: string;
  author: string;
  staffEmail: string | null;
  body: string;
  createdAt: Date;
};

const SUMMARY_SELECT = {
  id: true,
  subject: true,
  category: true,
  status: true,
  createdAt: true,
  lastMessageAt: true,
  lastStaffMessageAt: true,
  customerReadAt: true,
  staffReadAt: true,
  project: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;

type SummaryRow = Omit<TicketSummary, "messageCount"> & { _count: { messages: number } };

function toSummary(row: SummaryRow): TicketSummary {
  const { _count, ...rest } = row;
  return { ...rest, messageCount: _count.messages };
}

// ── Unread, defined once ──────────────────────────────────────────────────

/**
 * There is a reply the customer has not seen.
 *
 * Note what this does NOT ask: whether the ticket is "new". A ticket the
 * customer opened themselves five seconds ago is not news to them.
 */
export function hasUnreadReply(t: {
  lastStaffMessageAt: Date | null;
  customerReadAt: Date | null;
}): boolean {
  if (t.lastStaffMessageAt === null) return false;
  return t.customerReadAt === null || t.lastStaffMessageAt > t.customerReadAt;
}

/**
 * Nobody on our side has looked at what the customer last wrote.
 *
 * Leans on an invariant the writer below maintains: status OPEN means the last
 * message on the thread is the customer's, because the only thing that sets
 * OPEN is a customer sending something. So `lastMessageAt` IS the time of the
 * message being asked about, and no join is needed to page the queue.
 */
export function isUnseenByStaff(t: {
  status: string;
  lastMessageAt: Date;
  staffReadAt: Date | null;
}): boolean {
  if (t.status !== "OPEN") return false;
  return t.staffReadAt === null || t.lastMessageAt > t.staffReadAt;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** The customer's own tickets, newest activity first. */
export async function listCustomerTickets(userId: string, take = 50): Promise<TicketSummary[]> {
  const rows = await db.supportTicket.findMany({
    where: { userId },
    // Served straight off @@index([userId, lastMessageAt]). `id` breaks a
    // timestamp tie so two tickets opened in the same millisecond do not swap
    // places between renders.
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take,
    select: SUMMARY_SELECT,
  });
  return rows.map(toSummary);
}

/**
 * One ticket and its whole thread, scoped by owner IN THE SAME QUERY.
 *
 * Never "fetch by id, then check userId": another person's ticket has to be
 * indistinguishable from one that does not exist, which is the rule every
 * project route in this codebase already follows.
 */
export async function getCustomerTicket(
  userId: string,
  ticketId: string,
): Promise<{ ticket: TicketSummary; messages: TicketMessage[] } | null> {
  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: SUMMARY_SELECT,
  });
  if (!ticket) return null;
  const messages = await db.supportMessage.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, author: true, staffEmail: true, body: true, createdAt: true },
  });
  return { ticket: toSummary(ticket), messages };
}

/**
 * `user` is not optional, and that is a fact about erasure rather than an
 * oversight: SupportTicket.userId is required, and account erasure DELETES a
 * person's tickets rather than detaching them
 * (app/api/account/_deletion.ts), so there is no such thing as an orphaned
 * thread. The panel therefore never needs a "deleted account" branch here —
 * unlike /admin/feedback, which reads analytics events whose userId really is
 * set to null on erasure.
 */
export type StaffTicketRow = TicketSummary & { user: { id: string; email: string } };

const STAFF_SELECT = {
  ...SUMMARY_SELECT,
  user: { select: { id: true, email: true } },
} as const;

/** The operator queue. `status` must already have been validated. */
export async function listStaffTickets(opts: {
  status?: SupportStatus;
  skip?: number;
  take?: number;
}): Promise<{ rows: StaffTicketRow[]; total: number }> {
  const where: Prisma.SupportTicketWhereInput = opts.status ? { status: opts.status } : {};
  const [total, rows] = await Promise.all([
    db.supportTicket.count({ where }),
    db.supportTicket.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      skip: opts.skip ?? 0,
      take: opts.take ?? 50,
      select: STAFF_SELECT,
    }),
  ]);
  return {
    rows: rows.map((row) => {
      const { _count, ...rest } = row;
      return { ...rest, messageCount: _count.messages };
    }),
    total,
  };
}

export async function getStaffTicket(
  ticketId: string,
): Promise<{ ticket: StaffTicketRow; messages: TicketMessage[] } | null> {
  const row = await db.supportTicket.findUnique({ where: { id: ticketId }, select: STAFF_SELECT });
  if (!row) return null;
  const { _count, ...rest } = row;
  const messages = await db.supportMessage.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, author: true, staffEmail: true, body: true, createdAt: true },
  });
  return { ticket: { ...rest, messageCount: _count.messages }, messages };
}

/** Count per status, for the operator's filter. One grouped query, not four. */
export async function countTicketsByStatus(): Promise<Map<string, number>> {
  const rows = await db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
  return new Map(rows.map((r) => [r.status, r._count._all]));
}

// ── Writes ────────────────────────────────────────────────────────────────

/**
 * Append one message and do the ticket's bookkeeping.
 *
 * THE ONLY PLACE either side of the product writes a message, and it takes a
 * transaction client rather than using `db` directly, so the admin path can
 * wrap it together with its audit row (see adminActionRow in
 * lib/admin-audit.ts) and the customer path can wrap it with the ticket's own
 * creation. One writer means the status invariant and the read marks cannot
 * drift apart between the two callers.
 *
 * Three things happen together or not at all:
 *   1. the message row;
 *   2. `status`, from WHO wrote it — customer ⇒ OPEN, staff ⇒ ANSWERED. This
 *      is what makes "OPEN means the customer wrote last" true by
 *      construction rather than by convention, which isUnseenByStaff relies on;
 *   3. the author's own read mark, because you have by definition seen the
 *      thread you just replied to. Without this, replying to your own ticket
 *      would mark it unread to yourself.
 */
export async function appendMessage(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; author: TicketAuthor; staffEmail?: string; body: string },
): Promise<TicketMessage> {
  const now = new Date();
  const staff = input.author === "STAFF";

  const message = await tx.supportMessage.create({
    data: {
      ticketId: input.ticketId,
      author: input.author,
      staffEmail: staff ? (input.staffEmail ?? null) : null,
      body: input.body,
    },
    select: { id: true, author: true, staffEmail: true, body: true, createdAt: true },
  });

  await tx.supportTicket.update({
    where: { id: input.ticketId },
    data: {
      status: staff ? "ANSWERED" : "OPEN",
      lastMessageAt: now,
      ...(staff
        ? { lastStaffMessageAt: now, staffReadAt: now }
        : { customerReadAt: now }),
    },
  });

  return message;
}

/**
 * Mark a thread read for one side.
 *
 * Returns the read mark AS IT WAS, so the page can still draw the "new since
 * you last looked" line on the very render that clears it. Reading a thread
 * should not make the thing you came to read disappear.
 *
 * Scoped by userId on the customer side for the same reason getCustomerTicket
 * is: this is a write, and a write reachable with somebody else's id is worse
 * than a read.
 */
/**
 * `{ previous }` when the ticket exists and belongs to them, null when it does
 * not. The wrapper object is not ceremony: `previous` is legitimately null on a
 * thread nobody has opened yet, and a bare `Date | null` would make "never
 * read" and "no such ticket" the same value — which is precisely the pair the
 * caller has to tell apart to decide between a thread and a 404.
 */
export async function markCustomerRead(
  userId: string,
  ticketId: string,
): Promise<{ previous: Date | null } | null> {
  const before = await db.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: { customerReadAt: true },
  });
  if (!before) return null;
  await db.supportTicket.updateMany({
    where: { id: ticketId, userId },
    data: { customerReadAt: new Date() },
  });
  return { previous: before.customerReadAt };
}

export async function markStaffRead(ticketId: string): Promise<{ previous: Date | null } | null> {
  const before = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { staffReadAt: true },
  });
  if (!before) return null;
  await db.supportTicket.update({ where: { id: ticketId }, data: { staffReadAt: new Date() } });
  return { previous: before.staffReadAt };
}

import { db } from "@/lib/db";

// ── Active sign-in sessions, as the account holder can honestly be shown ───
//
// WHAT THE Session MODEL ACTUALLY RECORDS (prisma/schema.prisma):
//
//     id        String   @id @default(cuid())
//     userId    String
//     tokenHash String   @unique   // SHA-256 of the cookie value
//     expiresAt DateTime
//     createdAt DateTime @default(now())
//
// That is the entire row, and lib/auth.ts writes nothing else into it. There
// is NO user agent, NO IP address, NO last-seen timestamp, NO device or
// location, and no other table joins to it. So a session can be described with
// exactly three true facts: when the sign-in happened, when it stops working,
// and whether it is the one making the request.
//
// WHY NO COLUMNS WERE ADDED FOR THE REST. It would have been a two-line schema
// change, and it was rejected on purpose:
//
//   * A user agent and an IP address are new personal data. Both /legal/rights
//     and app/api/account/export/route.ts enumerate, in writing, everything the
//     product database holds — the export even lists "IP addresses … live
//     outside the product database" under what is deliberately NOT included.
//     Adding an IP column silently makes both of those documents wrong.
//   * `lastSeenAt` cannot be maintained without a database WRITE on every
//     authenticated request, because getCurrentUser is what every page and
//     route calls. That is a real cost for a cosmetic column.
//
// Neither is impossible; both are product decisions with consequences outside
// this directory, and inventing "Chrome on Windows · London" from a row that
// records none of it would be the exact fabrication the audit warns against.

/** What the UI is allowed to say about one session. Nothing more is known. */
export type SessionRow = {
  id: string;
  /** ISO. Creation time IS the sign-in time — a session is created by signing in. */
  createdAt: string;
  /** ISO. Fixed at creation (30 days); nothing in the product extends it. */
  expiresAt: string;
  /** True for exactly one row in a list: the session making the request. */
  current: boolean;
};

/**
 * Cap on rows returned. Every sign-in mints a session and nothing prunes them
 * before they expire, so an account that signs in daily on several devices can
 * accumulate a lot of live rows. The list is newest-first and the total is
 * reported alongside, so a truncated list says so rather than looking complete.
 */
export const SESSION_LIST_LIMIT = 50;

export type SessionList = {
  sessions: SessionRow[];
  /** Live sessions in total, which may exceed `sessions.length`. */
  total: number;
  limit: number;
};

/**
 * Live sessions only.
 *
 * Expired rows are excluded rather than shown as "expired": they are already
 * inert — getCurrentUser rejects them — and listing dead credentials under a
 * heading that says "active" invites someone to revoke something that stopped
 * working weeks ago and believe they have just secured their account.
 *
 * Scoped by userId inside the same query as every other filter, the rule the
 * export and deletion routes follow: another account's row has to be
 * indistinguishable from a row that does not exist.
 */
export async function listSessions(
  userId: string,
  currentSessionId: string | null,
): Promise<SessionList> {
  const now = new Date();
  const where = { userId, expiresAt: { gt: now } };

  const [rows, total] = await Promise.all([
    db.session.findMany({
      where,
      // Id breaks a timestamp tie so the order is total rather than merely
      // mostly-defined; cuids sort by generation time, so the newer row wins.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, expiresAt: true },
      take: SESSION_LIST_LIMIT,
    }),
    db.session.count({ where }),
  ]);

  return {
    sessions: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.id === currentSessionId,
    })),
    total,
    limit: SESSION_LIST_LIMIT,
  };
}

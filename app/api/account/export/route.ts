import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

// ── Account-level data export (an access request, self-served) ────────────
//
// NOT to be confused with app/api/projects/[id]/export/route.ts, which zips ONE
// project's draft source tree. This is the account-level answer the privacy
// policy points at: everything the product database holds about the person
// making the request, in one JSON document they can read without us.
//
// Three rules shape it:
//
// 1. SCOPED BY THE REQUESTER'S ID IN THE SAME QUERY AS ANY OTHER ID. Every
//    query below carries `userId` (or `project: { userId }`) in its own WHERE,
//    never "look up the project, then trust the id". Same rule the project
//    routes follow, for the same reason: another user's row must be
//    indistinguishable from a row that does not exist.
// 2. STREAMED, NOT BUFFERED. A single Response.json() would hold the entire
//    account — every file, every build snapshot — in memory as objects AND
//    again as a string. Build snapshots are full copies of a file tree per
//    successful build, so a heavy account is tens of megabytes. This assembles
//    the document in pages, the way lib/zip.ts streams an archive.
// 3. WHAT IS LEFT OUT IS NAMED IN THE FILE ITSELF. An export that silently
//    omits things is worse than one that says what it omits and why — see
//    NOT_INCLUDED below, which ships inside the download.

const FORMAT = "kodely.account-export";
const FORMAT_VERSION = 1;

/** Rows per page for most tables. */
const PAGE = 200;

/**
 * Builds are paged far smaller because each one can carry `filesSnapshot` — a
 * whole file tree. 200 of those at once would defeat the point of streaming.
 */
const BUILD_PAGE = 20;

/**
 * One export per user per minute.
 *
 * A full account dump is the most expensive read in the product, and nothing
 * else here is rate limited by user id at this cost. In memory and
 * per-process, exactly like checkEnhanceRateLimit in lib/rate-limit.ts, and
 * with the same honest limitation: it resets on deploy and multiplies if the
 * app is ever run as more than one process. That is adequate for a speed bump
 * on an authenticated route — this is not a security control, it is a guard
 * against a stuck client re-downloading in a loop.
 */
const COOLDOWN_MS = 60_000;
const MAX_KEYS = 5_000;
const lastExportAt = new Map<string, number>();

function throttled(userId: string): number | null {
  const now = Date.now();
  const previous = lastExportAt.get(userId);
  if (previous !== undefined && now - previous < COOLDOWN_MS) {
    return Math.ceil((COOLDOWN_MS - (now - previous)) / 1000);
  }
  // Bounded so a long-lived process cannot accumulate one entry per user
  // forever. Clearing wholesale only ever grants an extra export.
  if (lastExportAt.size > MAX_KEYS) lastExportAt.clear();
  lastExportAt.set(userId, now);
  return null;
}

/**
 * Stated inside the download. Everything here is either not held in the
 * product database at all, or is somebody else's personal data.
 */
const NOT_INCLUDED: { item: string; why: string }[] = [
  {
    item: "Your password",
    why: "Stored only as a salted scrypt hash, which is not reversible and is of no use to you.",
  },
  {
    item: "Session tokens",
    why: "Only a SHA-256 hash of each token is stored. The sessions themselves are listed below without it.",
  },
  {
    item: "The staff email address on each support note and each support-ticket reply",
    why: "That is another person's contact detail. The text and date of every note and every reply are included in full, and the replies are already readable on the ticket itself.",
  },
  {
    item: "Admin audit-log entries",
    why: "They record which operator performed an action, so they identify staff rather than you, and they are a security log.",
  },
  {
    item: "Web server and CDN access logs",
    why: "IP addresses and timestamps recorded by the servers in front of the app. They live outside the product database and are not queryable per account.",
  },
  {
    item: "Pre-authentication rate-limit counters",
    why: "Keyed by a salted hash of an IP address or email address specifically so they cannot be matched back to an account.",
  },
  {
    item: "Contact-form messages",
    why: "Emailed to our inbox and never written to the product database.",
  },
  {
    item: "Data held by Anthropic, Stripe, Google or Discord",
    why: "Those companies hold their own records under their own policies. Ask them directly.",
  },
];

/**
 * Emit a JSON array without ever holding the whole thing in memory.
 *
 * `page` is re-invoked with a growing offset until it returns a short page.
 * Offset paging can in principle skip or repeat a row if the table is written
 * to mid-export; every ordering below is `createdAt asc, id asc` over rows
 * that only the requesting user creates, so the practical exposure is one
 * project they created in the seconds the download took.
 */
async function* jsonArray<T>(
  page: (skip: number, take: number) => Promise<T[]>,
  shape: (row: T) => unknown,
  size = PAGE,
): AsyncGenerator<string> {
  yield "[";
  let skip = 0;
  let first = true;
  for (;;) {
    const rows = await page(skip, size);
    for (const row of rows) {
      yield (first ? "" : ",") + JSON.stringify(shape(row));
      first = false;
    }
    if (rows.length < size) break;
    skip += rows.length;
  }
  yield "]";
}

/**
 * `reward:<platform>:<hash>` (granted) or `reward:<platform>:pending:<hash>`
 * (declared, still on hold). The format is owned by app/api/rewards/_lib.ts —
 * parsed structurally here rather than importing that module's helpers, so the
 * export needs no knowledge of which platforms exist or what a hash means.
 */
function rewardFromReason(
  reason: string,
): { platform: string; pending: boolean; identityHash: string } | null {
  const parts = reason.split(":");
  if (parts[0] !== "reward" || parts.length < 3) return null;
  const pending = parts[2] === "pending";
  const identityHash = pending ? parts[3] : parts[2];
  if (!identityHash) return null;
  return { platform: parts[1], pending, identityHash };
}

async function* exportChunks(user: { id: string }): AsyncGenerator<string> {
  const userId = user.id;

  // Metadata only — one row per project, no file contents. The children of
  // each project are streamed separately below so a large project is never
  // fully resident.
  const projects = await db.project.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
    },
  });

  const account = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      spendCapCredits: true,
      googleId: true,
      stripeCustomerId: true,
      passwordHash: true,
      nxeonUserId: true,
      nxeonDomain: true,
      nxeonDomainExpiresAt: true,
      nxeonServerId: true,
      nxeonServerIp: true,
      nxeonServerHostname: true,
      nxeonHostingAccountId: true,
      nxeonHostingDomain: true,
    },
  });

  const balance = await getBalance(userId);

  yield `{"meta":${JSON.stringify({
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    about:
      "Everything Kodely's product database holds about this account, as of the moment above. " +
      "What is deliberately not in here, and why, is listed under notIncluded.",
    rights: "https://kodely.me/legal/rights",
    privacyPolicy: "https://kodely.me/legal/privacy",
    contact: "privacy@kodely.me",
    notIncluded: NOT_INCLUDED,
  })}`;

  yield `,"account":${JSON.stringify(
    account === null
      ? null
      : {
          id: account.id,
          email: account.email,
          name: account.name,
          role: account.role,
          createdAt: account.createdAt,
          // The hash itself is never exported; whether one exists is a fact
          // about how you sign in, and that is useful to you.
          signsInWithPassword: account.passwordHash !== null,
          signsInWithGoogle: account.googleId !== null,
          googleAccountId: account.googleId,
          stripeCustomerId: account.stripeCustomerId,
          spendCapCredits: account.spendCapCredits,
          creditBalance: balance,
          // Nxeon (domains / VPS / shared hosting) — a linked account and its
          // own separate wallet, entirely outside the Kodely credit ledger.
          nxeonLinked: account.nxeonUserId !== null,
          nxeonAccountId: account.nxeonUserId,
          nxeonDomain: account.nxeonDomain,
          nxeonDomainExpiresAt: account.nxeonDomainExpiresAt,
          nxeonServerId: account.nxeonServerId,
          nxeonServerIp: account.nxeonServerIp,
          nxeonServerHostname: account.nxeonServerHostname,
          nxeonHostingAccountId: account.nxeonHostingAccountId,
          nxeonHostingDomain: account.nxeonHostingDomain,
        },
  )}`;

  // Sessions: when you signed in and until when it is valid. Never tokenHash.
  yield `,"sessions":`;
  yield* jsonArray(
    (skip, take) =>
      db.session.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, createdAt: true, expiresAt: true },
        skip,
        take,
      }),
    (row) => row,
  );

  yield `,"projects":[`;
  let firstProject = true;
  for (const project of projects) {
    yield (firstProject ? "" : ",") +
      `{"id":${JSON.stringify(project.id)},"name":${JSON.stringify(project.name)},` +
      `"slug":${JSON.stringify(project.slug)},"createdAt":${JSON.stringify(project.createdAt)},` +
      `"updatedAt":${JSON.stringify(project.updatedAt)},` +
      `"publishedAt":${JSON.stringify(project.publishedAt)},` +
      `"publishedUrl":${JSON.stringify(
        project.publishedAt ? `https://${project.slug}.kodely.site` : null,
      )},"files":`;
    firstProject = false;

    // Both kinds and both states: "source" is the project you edit, "build" is
    // the compiled output, `published: true` is what the live site serves. The
    // per-project zip export only ever contains draft source, so this is the
    // first place all four combinations appear together.
    yield* jsonArray(
      (skip, take) =>
        db.projectFile.findMany({
          where: { projectId: project.id, project: { userId } },
          orderBy: [{ path: "asc" }, { id: "asc" }],
          select: {
            path: true,
            kind: true,
            published: true,
            content: true,
            updatedAt: true,
          },
          skip,
          take,
        }),
      (row) => row,
    );

    yield `,"messages":`;
    yield* jsonArray(
      (skip, take) =>
        db.message.findMany({
          where: { projectId: project.id, project: { userId } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { role: true, content: true, createdAt: true },
          skip,
          take,
        }),
      (row) => row,
    );

    yield `,"builds":`;
    yield* jsonArray(
      (skip, take) =>
        db.build.findMany({
          where: { projectId: project.id, project: { userId } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            status: true,
            model: true,
            prompt: true,
            error: true,
            createdAt: true,
            endedAt: true,
            inputTokens: true,
            outputTokens: true,
            cacheReadTokens: true,
            cacheWriteTokens: true,
            filesWritten: true,
            repairAttempts: true,
            costMicros: true,
            creditsCharged: true,
            filesSnapshot: true,
          },
          skip,
          take,
        }),
      (row) => row,
      BUILD_PAGE,
    );

    yield `}`;
  }
  yield `]`;

  yield `,"creditLedger":`;
  yield* jsonArray(
    (skip, take) =>
      db.creditLedger.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          delta: true,
          reason: true,
          buildId: true,
          balanceAfter: true,
          createdAt: true,
        },
        skip,
        take,
      }),
    (row) => row,
  );

  // Reward connections are not a table — they are ledger rows whose `reason`
  // encodes the platform and a keyed hash of the external account. Presented
  // separately because nobody should have to decode a reason string to see
  // which accounts they connected.
  yield `,"rewardConnections":`;
  yield* jsonArray(
    (skip, take) =>
      db.creditLedger.findMany({
        where: { userId, reason: { startsWith: "reward:" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { reason: true, delta: true, createdAt: true },
        skip,
        take,
      }),
    (row) => {
      const parsed = rewardFromReason(row.reason);
      return {
        platform: parsed?.platform ?? null,
        state: parsed?.pending ? "declared, on hold" : "granted",
        creditsGranted: row.delta,
        connectedAt: row.createdAt,
        identityHash: parsed?.identityHash ?? null,
        note:
          "identityHash is an HMAC of your account id on that platform, keyed with a server-side " +
          "secret. We store it instead of the username or id so the same external account cannot " +
          "claim the reward twice. Without that secret it cannot be turned back into your handle.",
      };
    },
  );

  // Analytics. Detached (userId set to null) rather than deleted if this
  // account is ever erased — see /legal/rights.
  yield `,"analyticsEvents":`;
  yield* jsonArray(
    (skip, take) =>
      db.event.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, props: true, createdAt: true },
        skip,
        take,
      }),
    (row) => row,
  );

  // Operator notes. The text is disclosed in full; the staff author is not —
  // see NOT_INCLUDED.
  yield `,"supportNotes":`;
  yield* jsonArray(
    (skip, take) =>
      db.supportNote.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { body: true, createdAt: true },
        skip,
        take,
      }),
    (row) => row,
  );

  // Support tickets, with the whole conversation on each.
  //
  // Nested rather than two flat arrays: a message is meaningless away from the
  // thread it answers, and a person opening this file to read what they were
  // told should not have to join two arrays by id to do it.
  //
  // The staff author of a reply is NOT included — see NOT_INCLUDED. The reply
  // text is, in full: it was written to be read by this person, and they can
  // already read it on /support.
  //
  // Tickets are fetched by id first so each thread's messages can be paged
  // independently, the same shape the project loop above uses. Both queries
  // carry the requester's id in their own WHERE.
  const tickets = await db.supportTicket.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      lastMessageAt: true,
      project: { select: { id: true, name: true } },
    },
  });

  yield `,"supportTickets":[`;
  let firstTicket = true;
  for (const ticket of tickets) {
    yield (firstTicket ? "" : ",") +
      `{"id":${JSON.stringify(ticket.id)},"subject":${JSON.stringify(ticket.subject)},` +
      `"category":${JSON.stringify(ticket.category)},"status":${JSON.stringify(ticket.status)},` +
      `"createdAt":${JSON.stringify(ticket.createdAt)},` +
      `"lastMessageAt":${JSON.stringify(ticket.lastMessageAt)},` +
      `"aboutProjectId":${JSON.stringify(ticket.project?.id ?? null)},` +
      `"aboutProjectName":${JSON.stringify(ticket.project?.name ?? null)},"messages":`;
    firstTicket = false;

    yield* jsonArray(
      (skip, take) =>
        db.supportMessage.findMany({
          where: { ticketId: ticket.id, ticket: { userId } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { author: true, body: true, createdAt: true },
          skip,
          take,
        }),
      (row) => ({
        // "CUSTOMER" is you; "STAFF" is whoever answered. The individual
        // staff member is deliberately not named.
        from: row.author === "STAFF" ? "Kodely support" : "You",
        body: row.body,
        createdAt: row.createdAt,
      }),
    );

    yield `}`;
  }
  yield `]`;

  // One row per transactional email actually sent to this account.
  yield `,"emailsSent":`;
  yield* jsonArray(
    (skip, take) =>
      db.emailLog.findMany({
        where: { userId },
        orderBy: [{ sentAt: "asc" }, { id: "asc" }],
        select: { kind: true, sentAt: true },
        skip,
        take,
      }),
    (row) => row,
  );

  // Publish-time moderation findings. ModerationFinding has no relation to
  // Project in the schema (a bare `projectId` column), so it cannot be scoped
  // by a relation filter the way everything above is — the id list comes from
  // the userId-scoped project query at the top of this function, and an empty
  // list is short-circuited rather than becoming `IN ()`.
  const projectIds = projects.map((p) => p.id);
  yield `,"moderationFindings":`;
  yield* jsonArray(
    (skip, take) =>
      projectIds.length === 0
        ? Promise.resolve([])
        : db.moderationFinding.findMany({
            where: { projectId: { in: projectIds } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              projectId: true,
              rule: true,
              severity: true,
              path: true,
              evidence: true,
              action: true,
              createdAt: true,
              reviewedAt: true,
              outcome: true,
            },
            skip,
            take,
          }),
    (row) => row,
  );

  yield `}\n`;
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const retryAfter = throttled(user.id);
  if (retryAfter !== null) {
    return Response.json(
      { error: "An export was just generated. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const chunks = exportChunks({ id: user.id });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // A query that throws mid-document errors the stream, which the browser
      // surfaces as a failed download rather than a truncated file. The status
      // line has already been sent by then, so there is no way to turn it into
      // a 500 — failing the transfer is the honest alternative.
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel() {
      void chunks.return(undefined);
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kodely-account-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

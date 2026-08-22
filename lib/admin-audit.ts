import { Prisma } from "@prisma/client";
import { db } from "./db";

// Who did what in the admin panel.
//
// Admin surfaces read cost, margin, customer prompts and personal data. Before
// this table there was no answer to "which admin looked at this account" —
// the panel is read-only, so nothing it does leaves a trace anywhere else.
//
// Modelled on lib/events.ts, and it borrows two of that file's rules:
//
// 1. NAMES ARE A CLOSED SET (ADMIN_ACTIONS below). Free-text action names rot
//    the same way free-text event names do, and an accountability record you
//    cannot filter reliably is not one.
// 2. META IS SMALL AND NON-PII. Ids, counts, short enum-ish strings. Never
//    prompt bodies, never generated content, never a customer's email or a
//    search string an admin typed (which is frequently a customer's email).
//    An audit log that quietly accumulates copies of customer data is a second
//    data-protection problem wearing the clothes of a solution.
//
// It deliberately BREAKS one rule of lib/events.ts — see "durability" below.

// ── Vocabulary ────────────────────────────────────────────────────────────
//
// What belongs in the log, stated once so the list below is derivable rather
// than a matter of taste:
//
//   * EVERY WRITE an admin makes, without exception.
//   * EVERY READ of a surface that exposes CUSTOMER data — accounts, prompts,
//     billing, feedback, support tickets, support notes, published sites.
//
// and, by the same rule, what does not: /admin/flags shows kill switches and
// rollout percentages, which are our data, not a customer's. Its writes are
// recorded (flag.changed, flag.seeded, flag.deleted); merely looking at it is
// not. A log that records everything indiscriminately is one nobody reads.
//
// Same discipline as EVENTS in lib/events.ts — a name nobody fires makes the
// log describe oversight that is not happening — but applied with one
// deliberate difference, because this vocabulary has a second job: it is the
// coordination point for admin surfaces owned by other people. So names are
// admitted here only when the SURFACE ALREADY EXISTS in the tree, and each one
// records whether anything actually emits it (ADMIN_ACTION_INFO). Two do today;
// the rest are a work order, and /admin/audit renders the outstanding list from
// that data — so it stays visible long after this comment stops being read.
export const ADMIN_ACTIONS = {
  siteTakenDown: "site.taken_down",
  auditLogViewed: "audit_log.viewed",
  dashboardViewed: "dashboard.viewed",
  userListViewed: "user_list.viewed",
  userViewed: "user.viewed",
  siteListViewed: "site_list.viewed",
  siteViewed: "site.viewed",
  feedbackViewed: "feedback.viewed",
  noteListViewed: "note_list.viewed",
  userNotesViewed: "user_notes.viewed",
  findingReviewed: "finding.reviewed",
  flagChanged: "flag.changed",
  flagSeeded: "flag.seeded",
  flagDeleted: "flag.deleted",
  supportNoteAdded: "support_note.added",
  ticketQueueViewed: "support_ticket_queue.viewed",
  ticketViewed: "support_ticket.viewed",
  ticketReplied: "support_ticket.replied",
  ticketStatusChanged: "support_ticket.status_changed",
  blogPostUpdated: "blog_post.updated",
  buildListViewed: "build_list.viewed",
  buildViewed: "build.viewed",
  assetLibraryViewed: "asset_library.viewed",
} as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];

/**
 * The panel area an action happens in. Fifteen dotted strings in one flat list
 * is a vocabulary you have to already know to use; the same fifteen under six
 * headings is one you can read. This exists so /admin/audit can group its
 * filter and its outstanding-work list without hard-coding a second copy of the
 * vocabulary in the page — the module owns what the names MEAN, the page owns
 * how they look.
 *
 * Ordered roughly by how much customer data the area exposes.
 */
export const ADMIN_SURFACES = [
  "customers",
  "sites",
  "support",
  "dashboard",
  "content",
  "flags",
  // Near the bottom of the list because it exposes no customer data at all —
  // the catalogue is code in lib/assets. It is in the vocabulary anyway; see
  // the note on asset_library.viewed below.
  "assets",
  "audit",
] as const;

export type AdminSurface = (typeof ADMIN_SURFACES)[number];

export const ADMIN_SURFACE_LABELS: Record<AdminSurface, string> = {
  customers: "Customers",
  sites: "Published sites",
  support: "Tickets, feedback & notes",
  dashboard: "Cost dashboard",
  content: "Blog & SEO content",
  flags: "Feature flags",
  assets: "Asset library",
  audit: "Audit log",
};

/**
 * Read or write. Not decoration: an unrecorded WRITE is strictly worse than an
 * unrecorded read — it means state changed and nothing anywhere says who
 * changed it — so this is what sorts the outstanding list on /admin/audit, and
 * it is the first cut anyone makes when reading the log ("what actually
 * changed?" before "who looked?").
 */
export type AdminActionKind = "read" | "write";

export type AdminActionInfo = {
  label: string;
  note: string;
  kind: AdminActionKind;
  surface: AdminSurface;
  emittedBy: string | null;
};

/**
 * What each action means, and — crucially — WHERE IT IS EMITTED FROM.
 *
 * `emittedBy: null` means the surface exists and reads or writes without
 * recording anything. That is not a footnote: it is a live gap in the record,
 * and holding it as data rather than prose is what lets /admin/audit show the
 * outstanding list instead of a comment nobody opens.
 *
 * Row COUNT cannot substitute for this. `site.taken_down` has a real emitter
 * and will sit at zero rows for months, because taking a site down is rare —
 * "no rows" and "nothing is watching" are different conditions and a panel that
 * conflated them would cry wolf until people stopped reading it.
 *
 * Keyed by the union, so adding a name without saying where it comes from is a
 * type error rather than a blank cell.
 */
export const ADMIN_ACTION_INFO: Record<AdminAction, AdminActionInfo> = {
  "blog_post.updated": {
    label: "Edited a published article",
    note: "Public content on kodely.me, changed live. bodyHtml is injected unsanitised.",
    kind: "write",
    surface: "content",
    emittedBy: "app/admin/content/[slug]/actions.ts",
  },
  "build_list.viewed": {
    label: "Browsed generations",
    note: "Prompts, owner emails and cost for 25 builds at a time, across every customer.",
    kind: "read",
    surface: "dashboard",
    emittedBy: "app/admin/builds/page.tsx",
  },
  "build.viewed": {
    label: "Inspected one generation",
    note: "One build in full: the whole prompt, the model's reply, the error, and the file manifest of the customer's generated source.",
    kind: "read",
    surface: "dashboard",
    emittedBy: "app/admin/builds/[id]/page.tsx",
  },
  "asset_library.viewed": {
    label: "Browsed the asset library",
    note: "The in-repo asset catalogue and the licence provenance claimed for it. Holds no customer data.",
    kind: "read",
    surface: "assets",
    // ── A DELIBERATE EXCEPTION TO THE RULE STATED AT THE TOP OF THIS FILE ──
    // By that rule this read should NOT be logged: the vocabulary records reads
    // of surfaces exposing CUSTOMER data, and /admin/flags is the standing
    // precedent for a surface that shows only our own data and records nothing
    // when you look at it. The asset catalogue is our own data too.
    //
    // It is recorded because of what the page ASSERTS rather than what it
    // shows. It is the surface an operator reads to answer "where did the
    // artwork on this customer's site come from, and were we allowed to put it
    // there" — and docs/research/asset-sources.md §5 names a per-asset
    // provenance record as the mitigation for the biggest legal risk in this
    // area. Who consulted the provenance claims, and when, is part of that
    // evidence trail in a way that "who looked at a rollout percentage" is not.
    //
    // If a future reviewer disagrees, the right change is to delete the call
    // site and set emittedBy to null — not to widen the rule.
    emittedBy: "app/admin/assets/page.tsx",
  },
  "site.taken_down": {
    label: "Took a site offline",
    note: "publishedAt cleared by an operator; the customer's files are untouched.",
    kind: "write",
    surface: "sites",
    // Written inside the same $transaction as the takedown — see adminActionRow.
    emittedBy: "app/admin/sites/actions.ts",
  },
  "audit_log.viewed": {
    label: "Viewed audit log",
    note: "Reading the accountability record is itself an access worth recording.",
    kind: "read",
    surface: "audit",
    emittedBy: "app/admin/audit/page.tsx",
  },
  "dashboard.viewed": {
    label: "Viewed cost dashboard",
    note: "Cost, margin, and 50 recent builds including customer prompts.",
    kind: "read",
    surface: "dashboard",
    emittedBy: "app/admin/page.tsx",
  },
  "user_list.viewed": {
    label: "Viewed customer list",
    note: "Emails, names, credit balances and lifetime spend, 25 at a time.",
    kind: "read",
    surface: "customers",
    emittedBy: "app/admin/users/page.tsx",
  },
  "user.viewed": {
    label: "Viewed customer account",
    note: "One customer in full: billing statement, projects, prompts, journey.",
    kind: "read",
    surface: "customers",
    emittedBy: "app/admin/users/[id]/page.tsx",
  },
  "site_list.viewed": {
    label: "Viewed site registry",
    note: "Published sites and their unreviewed moderation findings.",
    kind: "read",
    surface: "sites",
    emittedBy: "app/admin/sites/page.tsx",
  },
  "site.viewed": {
    label: "Viewed one site",
    note: "A single site's owner, findings and takedown history.",
    kind: "read",
    surface: "sites",
    emittedBy: "app/admin/sites/[id]/page.tsx",
  },
  "feedback.viewed": {
    label: "Viewed customer feedback",
    note: "Individual ratings and the reasons customers gave for them.",
    kind: "read",
    surface: "support",
    emittedBy: "app/admin/feedback/page.tsx",
  },
  "note_list.viewed": {
    label: "Viewed support-note index",
    note: "Recent notes, plus a search across customer emails and names.",
    kind: "read",
    surface: "support",
    emittedBy: "app/admin/feedback/notes/page.tsx",
  },
  "user_notes.viewed": {
    label: "Viewed notes on a customer",
    note: "Everything operators have written about one person.",
    kind: "read",
    surface: "support",
    emittedBy: "app/admin/feedback/notes/[userId]/page.tsx",
  },
  "finding.reviewed": {
    label: "Ruled on a moderation finding",
    note: "ModerationFinding keeps only the latest verdict, not who changed it when.",
    kind: "write",
    surface: "sites",
    emittedBy: "app/admin/sites/actions.ts",
  },
  "flag.changed": {
    label: "Changed a feature flag",
    note: "FeatureFlag stores only updatedBy/updatedAt — the previous value is lost.",
    kind: "write",
    surface: "flags",
    emittedBy: "app/admin/flags/actions.ts",
  },
  "flag.seeded": {
    label: "Seeded missing feature flags",
    note: "Bulk-creates every flag declared in lib/flags.ts that has no row yet.",
    kind: "write",
    surface: "flags",
    emittedBy: "app/admin/flags/actions.ts",
  },
  "flag.deleted": {
    label: "Deleted a feature flag",
    note: "Destructive and irreversible; the row and its history simply go.",
    kind: "write",
    surface: "flags",
    emittedBy: "app/admin/flags/actions.ts",
  },
  "support_note.added": {
    label: "Wrote a note about a customer",
    note: "SupportNote records the author, but nothing ties it to a panel session.",
    kind: "write",
    surface: "support",
    emittedBy: "app/admin/feedback/actions.ts",
  },
  "support_ticket_queue.viewed": {
    label: "Browsed the ticket queue",
    note: "Subjects and owner emails for a page of tickets at a time, across every customer.",
    kind: "read",
    surface: "support",
    emittedBy: "app/admin/support/page.tsx",
  },
  "support_ticket.viewed": {
    label: "Opened a support thread",
    note: "One conversation in full — everything the customer wrote about their account, in their own words.",
    kind: "read",
    surface: "support",
    emittedBy: "app/admin/support/[id]/page.tsx",
  },
  "support_ticket.replied": {
    label: "Replied to a customer",
    note: "The one write in the panel whose output is PUBLISHED to a customer on sight — it appears in their thread on /support and is emailed to them.",
    kind: "write",
    surface: "support",
    // Written inside the same $transaction as the reply itself — see
    // adminActionRow. A message the customer can read must not be able to
    // exist without the row saying who sent it.
    emittedBy: "app/admin/support/actions.ts",
  },
  "support_ticket.status_changed": {
    label: "Changed a ticket's status",
    note: "SupportTicket keeps only the current status, so the previous one exists nowhere else.",
    kind: "write",
    surface: "support",
    emittedBy: "app/admin/support/actions.ts",
  },
};

/** One action name and everything the vocabulary knows about it. */
export type AdminActionDescriptor = AdminActionInfo & { action: AdminAction };

function describe(action: AdminAction): AdminActionDescriptor {
  return { action, ...ADMIN_ACTION_INFO[action] };
}

/** Every name in the vocabulary, in declaration order. */
export function adminActionDescriptors(): AdminActionDescriptor[] {
  return (Object.keys(ADMIN_ACTION_INFO) as AdminAction[]).map(describe);
}

/**
 * The vocabulary as the panel groups it: surfaces in ADMIN_SURFACES order,
 * actions in declaration order within each. Surfaces with no actions are
 * dropped rather than rendered empty.
 */
export function adminActionsBySurface(): {
  surface: AdminSurface;
  label: string;
  actions: AdminActionDescriptor[];
}[] {
  return ADMIN_SURFACES.map((surface) => ({
    surface,
    label: ADMIN_SURFACE_LABELS[surface],
    actions: adminActionDescriptors().filter((d) => d.surface === surface),
  })).filter((g) => g.actions.length > 0);
}

/**
 * Actions whose surface exists but records nothing. Empty is the goal.
 *
 * Writes first: a write nobody records means state changed with no trace of who
 * changed it, which is a worse hole than an unrecorded read and should be the
 * first thing anyone reads off the panel.
 */
export function pendingAdminActions(): AdminActionDescriptor[] {
  const pending = adminActionDescriptors().filter((d) => d.emittedBy === null);
  return [
    ...pending.filter((d) => d.kind === "write"),
    ...pending.filter((d) => d.kind === "read"),
  ];
}

export function isAdminAction(v: unknown): v is AdminAction {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so `?action=
  // toString` would pass a guard whose entire job is to say this name is one of
  // OURS — and the caller would then read a Function off ADMIN_ACTION_INFO.
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ADMIN_ACTION_INFO, v);
}

/**
 * What the vocabulary knows about a raw action string, or null if it knows
 * nothing. Rows are read back from a plain String column, so this — not a cast
 * — is how the page turns one into a label.
 */
export function describeAdminAction(action: string): AdminActionDescriptor | null {
  return isAdminAction(action) ? describe(action) : null;
}

/**
 * What a row can point at. Closed for the same reason the action names are:
 * `targetType` is indexed, it is what "everything anyone did to this account"
 * filters on, and two spellings of "user" would split that answer in half —
 * silently, and in the direction of showing less than happened.
 *
 * A moderation finding is addressed as its project (with the finding id in
 * meta) rather than getting a type of its own: findings have no page, and the
 * question people ask is "what has been done to this site".
 */
export const ADMIN_TARGET_TYPES = {
  user: "user",
  project: "project",
  /** Keyed by the flag's `key`, which is FeatureFlag's primary key. */
  flag: "flag",
  /** Keyed by the post's `slug` — stable, and the live URL it publishes to. */
  blogPost: "blog_post",
  /**
   * A single generation. Deliberately its OWN type rather than filing builds
   * under `project`: app/admin/sites/[id] reads "everything done to this site"
   * off targetType+targetId, and folding build views in would drown a takedown
   * record in routine debugging traffic.
   */
  build: "build",
  /**
   * One support ticket. Its own type rather than filing threads under `user`
   * for the same reason `build` is not filed under `project`: a ticket has a
   * page of its own, and "everything anyone did to THIS thread" — who read it,
   * who answered, who resolved it — is a question with a single answer only if
   * the id it is asked by is the ticket's.
   */
  supportTicket: "support_ticket",
} as const;

export type AdminTargetType = (typeof ADMIN_TARGET_TYPES)[keyof typeof ADMIN_TARGET_TYPES];

/**
 * Flat by design — no nested objects, no arrays. The type is the enforcement:
 * you cannot spread a whole Prisma row into it by accident, which is the usual
 * way a log like this ends up holding a copy of the data it was meant to guard.
 */
export type AdminAuditMeta = Record<string, string | number | boolean | null | undefined>;

/** Just enough of the admin to attribute the row. `getAdminUser()` satisfies it. */
export type AdminActor = { id: string; email: string };

/**
 * Record one admin action.
 *
 * ── AWAITED, AND IT THROWS. Deliberately unlike `track()` in lib/events.ts. ──
 *
 * `track()` is fire-and-forget because a dropped analytics event is a small gap
 * in a chart and nobody would trade a failed generation for it. The trade here
 * runs the other way: a dropped audit row is a gap in an accountability record,
 * and a record with silent gaps is worse than no record at all, because people
 * will reason from its absences ("there is no row, so nobody looked").
 *
 * Two consequences follow, and both are intended:
 *
 *  1. CALL IT BEFORE THE READ, NOT AFTER. Awaiting the insert before the
 *     queries that fetch customer data means there is no window in which an
 *     admin has the data and the log does not have the row. `after()` from
 *     next/server would keep the page marginally faster and is the right tool
 *     for analytics, but it runs once the response is already on the wire —
 *     precisely the ordering an audit log must not have.
 *  2. A FAILED WRITE FAILS THE PAGE. No swallowed catch. If we cannot record
 *     the access, we do not serve the access: the page 500s and the customer
 *     data is never rendered. The cost of that posture is small in practice —
 *     the same Postgres serves the page's own queries, so an audit write that
 *     fails has almost certainly taken the page down anyway — and the failure
 *     is loud instead of leaving a hole nobody finds until it matters.
 *
 * The latency is one INSERT on an internal panel with a handful of users.
 */
export async function recordAdminAction(
  actor: AdminActor,
  action: AdminAction,
  opts: AdminActionTarget = {},
): Promise<void> {
  await db.adminAuditLog.create({ data: adminActionRow(actor, action, opts) });
}

export type AdminActionTarget = {
  targetType?: AdminTargetType;
  targetId?: string;
  meta?: AdminAuditMeta;
};

/**
 * The same row, as data, for the case `recordAdminAction` cannot serve: a write
 * that must be ATOMIC with the mutation it records.
 *
 *   await db.$transaction([
 *     db.project.update({ where: { id }, data: { publishedAt: null } }),
 *     db.adminAuditLog.create({
 *       data: adminActionRow(admin, ADMIN_ACTIONS.siteTakenDown, { ... }),
 *     }),
 *   ]);
 *
 * That is strictly stronger than awaiting the helper first — the site cannot go
 * dark without the row, and the row cannot exist for a takedown that rolled
 * back. Use this inside a transaction and `recordAdminAction` everywhere else;
 * either way the action name and target type stay type-checked, which is the
 * part a hand-written `db.adminAuditLog.create` gives up.
 */
export function adminActionRow(
  actor: AdminActor,
  action: AdminAction,
  opts: AdminActionTarget = {},
): Prisma.AdminAuditLogUncheckedCreateInput {
  return {
    actorId: actor.id,
    // Denormalised on purpose: the schema keeps actorId as a plain string so
    // the row outlives the admin's account, and an id alone would then be
    // unreadable. This is the email AS IT WAS at the time of the action.
    actorEmail: actor.email,
    action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    meta: opts.meta ? (JSON.parse(JSON.stringify(opts.meta)) as object) : undefined,
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────
// The log is only worth writing if it is readable. Queries live here rather
// than in the page for the same reason the funnel queries live in
// lib/events.ts: the shape of the table is this module's business.

export type AdminAuditEntry = {
  id: string;
  createdAt: Date;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Prisma.JsonValue | null;
};

export type AdminAuditPage = {
  entries: AdminAuditEntry[];
  total: number;
};

/**
 * Newest first, filtered and paginated. Both filters are served straight off
 * the indexes the schema already declares — `[actorId, createdAt]` and
 * `[action, createdAt]` — which is why those two, and not free-text search,
 * are the filters this page offers.
 */
export async function listAdminActions(opts: {
  actorId?: string;
  action?: AdminAction;
  skip?: number;
  take?: number;
}): Promise<AdminAuditPage> {
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    ...(opts.action ? { action: opts.action } : {}),
  };

  const [total, entries] = await Promise.all([
    db.adminAuditLog.count({ where }),
    db.adminAuditLog.findMany({
      where,
      // `id` breaks ties so paging is stable when two rows share a timestamp —
      // same idiom as the user list.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: opts.skip ?? 0,
      take: opts.take ?? 50,
      select: {
        id: true,
        createdAt: true,
        actorId: true,
        actorEmail: true,
        action: true,
        targetType: true,
        targetId: true,
        meta: true,
      },
    }),
  ]);

  return { entries, total };
}

/**
 * Row count per action name, for the action filter — and, more usefully, so
 * the page can show which names in the vocabulary have never fired. A declared
 * action with zero rows means a surface that is still reading customer data
 * without recording it; surfacing that in the panel is how the list of owed
 * call sites stays visible after this change's report is forgotten.
 */
export async function countAdminActions(): Promise<Map<string, number>> {
  const rows = await db.adminAuditLog.groupBy({
    by: ["action"],
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.action, r._count._all]));
}

export type AdminAuditActor = { actorId: string; actorEmail: string; actions: number; lastAt: Date };

/**
 * Everyone who has ever appeared in the log, for the actor filter. Grouped
 * rather than DISTINCT-ed because an admin who changed email address has rows
 * under both, and the filter should offer them once, under the newest.
 */
export async function listAdminActors(): Promise<AdminAuditActor[]> {
  const rows = await db.adminAuditLog.groupBy({
    by: ["actorId", "actorEmail"],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  });

  const seen = new Map<string, AdminAuditActor>();
  for (const r of rows) {
    const existing = seen.get(r.actorId);
    if (existing) {
      // Rows are newest-first, so the first email wins as the display name and
      // later ones only contribute their counts.
      existing.actions += r._count._all;
      continue;
    }
    seen.set(r.actorId, {
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      actions: r._count._all,
      lastAt: r._max.createdAt ?? new Date(0),
    });
  }

  return [...seen.values()];
}

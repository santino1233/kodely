"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, adminActionRow } from "@/lib/admin-audit";
import { TAKEDOWN_REASONS, hasKey } from "./ui";

// The only two mutations this surface has: recording a moderation review, and
// taking a published site offline. There is deliberately no delete, no edit and
// no "publish on someone's behalf" — the panel reviews other people's private
// work, and the strongest guarantee it can offer is that it cannot alter it.
//
// Server Functions are reachable by direct POST, not only through this UI, so
// every one of them re-checks getAdminUser() itself. app/admin/layout.tsx does
// not sit in front of an action invocation, and neither does the page's own
// check — an attacker POSTing an action id never renders the page at all.
// 404 rather than 403, for the same reason the pages use notFound(): a
// non-admin learns nothing about what exists here.

const REVIEW_OUTCOMES = new Set(["true_positive", "false_positive"]);

export async function reviewFinding(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const findingId = String(formData.get("findingId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (!findingId || !REVIEW_OUTCOMES.has(outcome)) notFound();

  const finding = await db.moderationFinding.findUnique({
    where: { id: findingId },
    select: { id: true, projectId: true },
  });
  if (!finding) notFound();

  // Re-reviewing an already-reviewed finding OVERWRITES the verdict rather than
  // appending — the column set only holds one, and an operator correcting their
  // own mistake matters more than the history of the correction.
  //
  // Which is exactly why the audit row is not optional here. ModerationFinding
  // keeps only the latest verdict, so without this the sequence "ruled a true
  // positive, quietly re-ruled a false positive" is indistinguishable from
  // "always was a false positive" — and that verdict is the input to the
  // per-rule false-positive rate that decides whether a medium rule gets
  // promoted to blocking. Same transaction as the update so a verdict can never
  // change without a record of who changed it.
  await db.$transaction([
    db.moderationFinding.update({
      where: { id: findingId },
      data: {
        reviewedAt: new Date(),
        // Email, matching AdminAuditLog.actorEmail and SupportNote.authorEmail —
        // an id here would need a join to mean anything to a human.
        reviewedBy: admin.email,
        outcome,
      },
    }),
    db.adminAuditLog.create({
      data: adminActionRow(admin, ADMIN_ACTIONS.findingReviewed, {
        // A finding is addressed as its project — see ADMIN_TARGET_TYPES. That
        // keeps "everything anyone did to this site" a single indexed query.
        targetType: ADMIN_TARGET_TYPES.project,
        targetId: finding.projectId,
        // Ids and one enum value. Never the rule's evidence snippet: that is a
        // quotation from the customer's own page.
        meta: { findingId, verdict: outcome },
      }),
    }),
  ]);

  revalidatePath(`/admin/sites/${finding.projectId}`);
  revalidatePath("/admin/sites");
}

/**
 * Takes a published site offline by clearing `publishedAt`.
 *
 * That single column is what makes a site live: app/api/site/[slug]/[[...path]]
 * answers 404 for every path — pages, assets, and the synthesised robots.txt
 * and sitemap.xml alike — the moment it is null, and proxy.ts rewrites
 * <slug>.kodely.site into that route with no state of its own. Nothing else is
 * consulted.
 *
 * Nothing is deleted. The published file rows stay exactly where they are, the
 * draft tree is untouched, and the project keeps its slug — so the owner still
 * has all of their work and can republish it themselves from the project page.
 */
export async function takeDownSite(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const projectId = String(formData.get("projectId") ?? "");
  const confirmSlug = String(formData.get("confirmSlug") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");
  if (!projectId) notFound();

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, slug: true, userId: true, publishedAt: true },
  });
  if (!project) notFound();

  // Already offline — someone took it down in another tab, or the owner never
  // republished. Not an error, just nothing left to do.
  if (!project.publishedAt) {
    redirect(`/admin/sites/${projectId}?takedown=already`);
  }

  // hasKey, not `reason in TAKEDOWN_REASONS` or a truthiness check on the
  // lookup: both are satisfied by Object.prototype members, so `reason=
  // constructor` would sail through and be written into the audit log as the
  // stated justification for a takedown.
  if (!hasKey(TAKEDOWN_REASONS, reason)) {
    redirect(`/admin/sites/${projectId}/takedown?error=reason`);
  }

  // The confirmation step. Typing the slug is the whole guard against taking
  // down the wrong site from a list of near-identical rows, so it is checked
  // HERE and not only in the browser.
  if (confirmSlug !== project.slug) {
    redirect(`/admin/sites/${projectId}/takedown?error=slug`);
  }

  await db.$transaction([
    db.project.update({ where: { id: projectId }, data: { publishedAt: null } }),
    // Append-only, and written in the same transaction as the takedown so a
    // site can never go dark with no record of who darkened it.
    //
    // adminActionRow() rather than a hand-written object: it is the one call
    // site where a typo in the action name or the target type would compile
    // cleanly and then write a row that /admin/audit's filters cannot see.
    // Going through the vocabulary in lib/admin-audit.ts makes both of those a
    // type error instead.
    db.adminAuditLog.create({
      data: adminActionRow(admin, ADMIN_ACTIONS.siteTakenDown, {
        targetType: ADMIN_TARGET_TYPES.project,
        targetId: projectId,
        meta: {
          slug: project.slug,
          ownerId: project.userId,
          reason,
          // What the site's live-since timestamp was, since the column that
          // held it is about to be null.
          publishedAt: project.publishedAt.toISOString(),
        },
      }),
    }),
  ]);

  revalidatePath(`/admin/sites/${projectId}`);
  revalidatePath("/admin/sites");
  redirect(`/admin/sites/${projectId}?takedown=done`);
}

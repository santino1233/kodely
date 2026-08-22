"use server";

import { refresh } from "next/cache";
import {
  ADMIN_ACTIONS,
  ADMIN_TARGET_TYPES,
  adminActionRow,
  recordAdminAction,
  type AdminActor,
  type AdminAuditMeta,
} from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/auth";
import { clampRolloutPct, deleteOrphanFlag, seedFlags, setFlag } from "@/lib/flags";

// Server Actions for /admin/flags.
//
// A Server Action is a POST endpoint against the page, reachable by anyone who
// can send the request — rendering the form only on an admin page is not an
// authorization boundary (see the Next.js Server Actions guide, and the same
// argument in getAdminUser's doc comment). So every action re-checks admin
// itself and fails loudly. These writes turn generation and credit grants on
// and off; a silent no-op on a missed check would be far worse than a 500.
//
// ── Audit ────────────────────────────────────────────────────────────────
// Every one of these is a WRITE, and lib/admin-audit.ts admits no exceptions
// for writes: `FeatureFlag` keeps only `updatedBy`/`updatedAt`, so the row can
// say who touched a flag last but never what it was before, nor that it was
// flipped off and back on inside a minute. The audit row is what makes a 3am
// kill switch reconstructable afterwards.
//
// Reads of this page are deliberately NOT recorded — kill switches and rollout
// percentages are our data, not a customer's, and that distinction is stated at
// the top of lib/admin-audit.ts.
//
// ORDERING. `recordAdminAction` is awaited AFTER the mutation for the two
// non-destructive actions, and inside the same transaction for the destructive
// one:
//
//   * `flag.changed` / `flag.seeded` — recording first would mean a row that
//     claims a change which then failed to apply, i.e. a false statement in an
//     accountability record. Recording after can at worst lose the row for a
//     change that DID apply — and that change is still legible, because it is
//     sitting in the table with its own `updatedBy`/`updatedAt`, and the failed
//     insert 500s loudly rather than passing silently.
//   * `flag.deleted` — no such fallback exists, because the row it would be
//     reconstructed from is precisely what was destroyed. That one goes in the
//     same transaction as the delete (see `deleteOrphanFlag`).

async function requireAdmin(): Promise<AdminActor> {
  const admin = await getAdminUser();
  if (!admin) throw new Error("FORBIDDEN");
  // Both halves are needed: `updatedBy` on the flag row is free text and the
  // email is what an incident review actually wants to read, while the audit
  // row keeps the id as well so it survives the address changing.
  return admin;
}

function flagKeyFrom(formData: FormData): string {
  const key = formData.get("key");
  if (typeof key !== "string" || !key) throw new Error("Missing flag key");
  // Not validated against FLAGS here — setFlag and deleteOrphanFlag each
  // enforce their own, opposite, membership rule.
  return key;
}

/**
 * One action for all three row buttons, distinguished by `intent`, so the row
 * stays a single plain <form> that works without JavaScript.
 *
 * `on` and `off` deliberately send NO percentage: the kill button does exactly
 * one thing, and never commits a number the operator was still editing.
 */
export async function saveFlagAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = flagKeyFrom(formData);
  const intent = formData.get("intent");

  // Mirrors the patch that was actually applied, so the log says which of the
  // two fields moved rather than just "something changed".
  let meta: AdminAuditMeta;

  if (intent === "on" || intent === "off") {
    const enabled = intent === "on";
    await setFlag(key, { enabled }, admin.email);
    meta = { intent, enabled };
  } else if (intent === "rollout") {
    const raw = Number.parseInt(String(formData.get("rolloutPct") ?? ""), 10);
    if (!Number.isFinite(raw)) throw new Error("Rollout percentage must be a number");
    // The clamped value, not the raw one: the log should say what was stored.
    const rolloutPct = clampRolloutPct(raw);
    await setFlag(key, { rolloutPct }, admin.email);
    meta = { intent, rolloutPct };
  } else {
    throw new Error(`Unknown intent: ${String(intent)}`);
  }

  // After setFlag, which rejects a key outside FLAGS — so a rejected write
  // never leaves a row claiming a flag that does not exist was changed.
  await recordAdminAction(admin, ADMIN_ACTIONS.flagChanged, {
    targetType: ADMIN_TARGET_TYPES.flag,
    targetId: key,
    meta,
  });

  // The page is force-dynamic, so there is no cached data to invalidate — the
  // stored value just needs to be re-read and re-rendered. `refresh()` does
  // exactly that and ships the new RSC payload in this same response, so the
  // operator sees the flag's real state without a second round trip.
  refresh();
}

export async function seedFlagsAction(): Promise<void> {
  const admin = await requireAdmin();
  const created = await seedFlags(admin.email);
  // Recorded even when `created` is 0: the button was pressed, and "an admin
  // ran the seeder and it did nothing" is a fact worth being able to read back.
  await recordAdminAction(admin, ADMIN_ACTIONS.flagSeeded, { meta: { created } });
  refresh();
}

export async function deleteOrphanFlagAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = flagKeyFrom(formData);
  // Atomic with the delete — the row being destroyed is the only other place
  // this action was written down.
  await deleteOrphanFlag(
    key,
    adminActionRow(admin, ADMIN_ACTIONS.flagDeleted, {
      targetType: ADMIN_TARGET_TYPES.flag,
      targetId: key,
    }),
  );
  refresh();
}

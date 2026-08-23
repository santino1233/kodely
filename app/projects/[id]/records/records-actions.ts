"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseFields } from "@/lib/site-endpoint";

// The project OWNER's own update/cancel controls for a SiteRecord — the
// authenticated counterpart to the anonymous, token-gated manage link
// lib/site-records.ts hands a submitter. The owner needs no token: real
// ownership here is the existing auth session plus the existing
// project.userId check every other route in this directory already uses
// (see diff-actions.ts), scoped down to one record by projectId AND id.
//
// SECURITY. A Server Action is a POST against the page and reachable by
// anyone who can send the request — rendering the button only for the
// signed-in owner is not itself an authorization boundary. Every function
// here re-checks the session and re-scopes the query by `project.userId`,
// so a record id belonging to someone else's project is indistinguishable
// from one that does not exist.
//
// Same validation discipline as the anonymous write path: field replacement
// goes through the exact same parseFields() lib/site-records.ts uses at
// create/update time (name pattern, per-field cap, field-count cap), not a
// second, looser copy of those rules for "trusted" owner input.

type ActionResult = { ok: true } | { ok: false; error: string };

async function ownedRecord(projectId: string, recordId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.siteRecord.findFirst({
    where: { id: recordId, projectId, project: { userId: user.id } },
    select: { id: true, status: true },
  });
}

/**
 * Cancel or restore a record the caller owns. Never a hard delete in either
 * direction — "cancelled" is just another status, same as the anonymous
 * cancel path, so the schema's own "history isn't destroyed" comment holds
 * for the owner too.
 */
export async function setSiteRecordStatus(
  projectId: string,
  recordId: string,
  status: "active" | "cancelled",
): Promise<ActionResult> {
  const record = await ownedRecord(projectId, recordId);
  if (!record) return { ok: false, error: "That record could not be found." };
  if (record.status === status) return { ok: true };
  await db.siteRecord.update({ where: { id: record.id }, data: { status } });
  return { ok: true };
}

/**
 * Replace a record's stored fields wholesale, from a plain `<form>`'s
 * FormData — converted to the same urlencoded shape parseFields() already
 * parses everywhere else, rather than re-implementing field validation a
 * second time for "this caller happens to be authenticated".
 */
export async function updateSiteRecordFields(
  projectId: string,
  recordId: string,
  formData: FormData,
): Promise<ActionResult> {
  const record = await ownedRecord(projectId, recordId);
  if (!record) return { ok: false, error: "That record could not be found." };

  const pairs: [string, string][] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") pairs.push([key, value]);
  }
  const parsed = parseFields(new URLSearchParams(pairs).toString());
  if (!parsed.ok) return { ok: false, error: parsed.message };

  await db.siteRecord.update({ where: { id: record.id }, data: { fields: parsed.fields } });
  return { ok: true };
}

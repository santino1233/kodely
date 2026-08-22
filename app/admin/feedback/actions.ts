"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, adminActionRow } from "@/lib/admin-audit";
import { NOTE_MAX, type NoteFormState } from "./ui";

// Writing a support note is the only mutation this inbox performs. Everything
// else on these pages reads.
//
// A "use server" file may only export async functions, so NOTE_MAX and the
// form-state type live in ./ui.tsx and are imported (the type as a type-only
// import, so nothing React-shaped is dragged into the action bundle).

export async function addSupportNote(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  // Server Functions are reachable by direct POST, not only through this UI —
  // so the admin check happens HERE, not merely on the page that renders the
  // form. Same reason getAdminUser() is called on every admin page: a layout
  // is not an authorization boundary.
  const admin = await getAdminUser();
  if (!admin) return { error: "You are not signed in as an admin.", ok: false };

  const rawUserId = formData.get("userId");
  const rawBody = formData.get("body");
  const userId = typeof rawUserId === "string" ? rawUserId : "";
  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  if (!userId) return { error: "Missing the customer this note is about.", ok: false };
  if (!body) return { error: "A note needs something in it.", ok: false };
  if (body.length > NOTE_MAX) {
    return {
      error: `That is ${body.length} characters — keep a note under ${NOTE_MAX}. Summarise rather than paste.`,
      ok: false,
    };
  }

  // Verify the target exists rather than letting the foreign key throw: a 500
  // on a stale tab is a worse answer than a sentence.
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "That customer no longer exists.", ok: false };

  // The note and its audit row go in together or not at all. adminActionRow
  // (rather than recordAdminAction) exists for exactly this: a write that must
  // be atomic with the mutation it records, so there can be no note whose
  // authorship the log does not account for, and no log row for a note that
  // rolled back. An interactive transaction rather than the array form because
  // the row's meta carries the new note's id, which does not exist until the
  // insert has run.
  //
  // meta holds the ID ONLY. The note body is already disclosable in a
  // data-subject access request; copying its text into the audit log would
  // double the exposure and double the number of places it has to be found and
  // redacted. The id is enough to join back to the note itself.
  await db.$transaction(async (tx) => {
    const note = await tx.supportNote.create({
      // authorEmail comes from the session, never from the form. Attribution
      // nobody can spoof is the whole point of recording it.
      data: { userId: user.id, authorEmail: admin.email, body },
      select: { id: true },
    });
    await tx.adminAuditLog.create({
      data: adminActionRow(admin, ADMIN_ACTIONS.supportNoteAdded, {
        targetType: ADMIN_TARGET_TYPES.user,
        targetId: user.id,
        meta: { noteId: note.id },
      }),
    });
  });

  // Re-render the current route so the new note appears above the form without
  // a manual reload.
  refresh();

  return { error: null, ok: true };
}

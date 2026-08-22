"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { recordAdminAction, ADMIN_ACTIONS, ADMIN_TARGET_TYPES } from "@/lib/admin-audit";
import { validateDraft, type PostFields } from "./validation";
import { INITIAL_EDITOR_STATE, type EditorDraft, type EditorState } from "./editor-state";

// Server Actions for /admin/content.
//
// ── THE SECURITY ARGUMENT, STATED ONCE ────────────────────────────────────
//
// `bodyHtml` is injected into a public page with dangerouslySetInnerHTML and no
// sanitisation (app/blog/[slug]/page.tsx line 118). Two things follow, and both
// are enforced here rather than in the browser:
//
// 1. A Server Action is a POST endpoint against the route, reachable by anyone
//    who can send the request. Rendering the editor only on an admin page is
//    not an authorization boundary — see the Next.js Server Actions guide and
//    the argument in getAdminUser's doc comment. So this re-checks ADMIN
//    itself, on every call, and throws rather than no-oping. There is no other
//    write path to bodyHtml in the application.
//
// 2. Client-side validation is a convenience for the person typing; it is not a
//    control. Every field is re-validated on the server, from the submitted
//    FormData, immediately before the write — and a draft with any problem is
//    refused. The editor cannot be talked into storing markup the blog page
//    cannot safely render, because the check does not live in the editor.
//
// The write is deliberately narrow: five columns of one row, addressed by a
// slug that must already exist. No create path, no delete path, no bulk path.
// Correcting 56 live pages with a find-and-replace is exactly how one wrong
// sentence becomes 56 wrong ones, so this surface only ever changes the one
// post an admin is looking at.
//
// NOT AUDIT LOGGED, and that is a gap rather than a decision: lib/admin-audit.ts
// keeps a deliberately CLOSED vocabulary (ADMIN_ACTIONS) and has no name for a
// content write, and this change is not permitted to edit lib/. A
// `blog_post.updated` action belongs in that vocabulary — it is a write to
// public content, which is the strongest case the module makes for recording
// something — and should be added with a call from `savePostAction` below.

async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) throw new Error("FORBIDDEN");
  return admin;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Normalises what a <textarea> and an <input> actually submit.
 *
 * A browser sends textarea content with CRLF line endings, and the stored
 * bodies use LF (scripts/seo/lib.mjs joins blocks with "\n"). Left alone, every
 * save would rewrite every line of a body the admin did not touch, which turns
 * "fixed one sentence" into an unreviewable diff. Single-line fields are
 * trimmed; the body is only stripped of trailing whitespace, since leading
 * structure is meaningful.
 */
function readDraft(formData: FormData): EditorDraft {
  return {
    title: field(formData, "title").trim(),
    metaDescription: field(formData, "metaDescription").trim(),
    category: field(formData, "category").trim(),
    targetKeyword: field(formData, "targetKeyword").trim(),
    bodyHtml: field(formData, "bodyHtml").replace(/\r\n/g, "\n").trim(),
  };
}

function isSame(a: EditorDraft, b: EditorDraft): boolean {
  return (
    a.title === b.title &&
    a.metaDescription === b.metaDescription &&
    a.category === b.category &&
    a.targetKeyword === b.targetKeyword &&
    a.bodyHtml === b.bodyHtml
  );
}

/**
 * Every other post, for the four validator checks that only mean anything
 * across the corpus: duplicate slug, duplicate title, duplicate
 * metaDescription, and whether a /blog/… link points at a post that exists.
 */
async function corpus(excludeSlug: string): Promise<PostFields[]> {
  return db.blogPost.findMany({
    where: { slug: { not: excludeSlug } },
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      title: true,
      metaDescription: true,
      category: true,
      targetKeyword: true,
      bodyHtml: true,
    },
  });
}

/**
 * The editor's only action. `intent` decides whether a clean draft is written
 * or merely rendered; an unclean one is neither, whichever button was pressed.
 */
export async function savePostAction(
  _prev: EditorState,
  formData: FormData,
): Promise<EditorState> {
  const admin = await requireAdmin();

  const slug = field(formData, "slug");
  const intent = field(formData, "intent") === "save" ? "save" : "preview";
  const draft = readDraft(formData);

  const existing = await db.blogPost.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      metaDescription: true,
      category: true,
      targetKeyword: true,
      bodyHtml: true,
    },
  });
  if (!existing) {
    return {
      ...INITIAL_EDITOR_STATE,
      status: "error",
      message: `No post with slug “${slug}”. Nothing was written.`,
    };
  }

  const dirty = !isSame(draft, existing);
  const { problems, warnings } = validateDraft({ slug, ...draft }, await corpus(slug));

  if (problems.length > 0) {
    return {
      status: "refused",
      message:
        intent === "save"
          ? "Not saved. The body is rendered into a public page unsanitised, so an invalid draft is never written."
          : "Cannot preview: this draft would not render correctly.",
      problems,
      warnings,
      previewHtml: null,
      dirty,
    };
  }

  if (intent === "preview") {
    return {
      status: "preview",
      message: dirty
        ? "Valid. This is how the post would render — nothing has been written yet."
        : "Valid, and identical to what is published right now.",
      problems,
      warnings,
      previewHtml: draft.bodyHtml,
      dirty,
    };
  }

  if (!dirty) {
    return {
      status: "preview",
      message: "Nothing changed, so nothing was written — updatedAt is left alone.",
      problems,
      warnings,
      previewHtml: draft.bodyHtml,
      dirty: false,
    };
  }

  await db.blogPost.update({
    where: { slug },
    data: {
      title: draft.title,
      metaDescription: draft.metaDescription,
      category: draft.category,
      targetKeyword: draft.targetKeyword,
      bodyHtml: draft.bodyHtml,
    },
  });

  // Recorded AFTER the update, so a row can never assert a change that then
  // failed to apply. `BlogPost` keeps no version history, so this is the only
  // record that the live text used to say something else — which matters most
  // for exactly the edits this panel exists to make: correcting a claim that
  // was published and wrong. Meta names which fields moved, never their
  // contents; the body is public anyway, but copying it here would make the
  // audit log a second, unversioned copy of the site.
  await recordAdminAction(admin, ADMIN_ACTIONS.blogPostUpdated, {
    targetType: ADMIN_TARGET_TYPES.blogPost,
    targetId: slug,
    meta: {
      titleChanged: draft.title !== existing.title,
      metaChanged: draft.metaDescription !== existing.metaDescription,
      bodyChanged: draft.bodyHtml !== existing.bodyHtml,
      bodyLength: draft.bodyHtml.length,
    },
  });

  // app/blog/[slug]/page.tsx is force-static with revalidate 3600, so without
  // this the correction sits invisible for up to an hour — on a panel whose
  // entire purpose is fixing something wrong that is live right now. The index
  // is force-dynamic but is invalidated too, since a title or category change
  // moves the card there as well.
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog");

  return {
    status: "saved",
    message: "Saved and published. /blog and this post were revalidated.",
    problems,
    warnings,
    previewHtml: draft.bodyHtml,
    dirty: false,
  };
}

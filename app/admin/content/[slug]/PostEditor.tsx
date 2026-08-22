"use client";

import { useActionState, useState, type ReactNode } from "react";
import { savePostAction } from "../actions";
import { INITIAL_EDITOR_STATE, type EditorDraft, type EditorState } from "../editor-state";
import { buttonClass, fieldClass, primaryButtonClass, VerdictList, wordCount } from "../ui";

// The editor form.
//
// A Client Component only because the panel has to SHOW the verdict — which
// problems were found, and the rendered preview — rather than throw or silently
// redirect. useActionState is the documented way to get a value back out of a
// Server Action (see the Next.js forms guide), and it also supplies the pending
// flag that disables both buttons mid-flight.
//
// Nothing here decides whether a draft is valid. The buttons post to
// savePostAction and render whatever it says; the rules run on the server, on
// the submitted FormData, and the preview HTML is only ever the string the
// server has already judged clean. Turning off JavaScript removes the preview,
// not the validation.
//
// Fields are controlled so a refused save comes back with the admin's typing
// intact. Losing a half-finished correction to a validation error is the
// quickest way to make someone go back to editing the database by hand.

const CATEGORY_LIST_ID = "admin-content-categories";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-black/70 dark:text-white/70">{label}</span>
      {hint ? <span className="ml-2 text-xs text-black/45 dark:text-white/45">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function statusTone(status: EditorState["status"]): string {
  if (status === "saved") return "border-emerald-600/40 text-emerald-700 dark:text-emerald-400";
  if (status === "refused" || status === "error") {
    return "border-red-600/40 text-red-700 dark:text-red-400";
  }
  return "border-black/10 text-black/70 dark:border-white/10 dark:text-white/70";
}

export function PostEditor({
  slug,
  published,
  categories,
}: {
  slug: string;
  /** The row as it is stored right now — the thing "Revert" goes back to. */
  published: EditorDraft;
  /** Categories already in use, offered as suggestions rather than enforced. */
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<EditorState, FormData>(
    savePostAction,
    INITIAL_EDITOR_STATE,
  );
  const [draft, setDraft] = useState<EditorDraft>(published);

  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty =
    draft.title !== published.title ||
    draft.metaDescription !== published.metaDescription ||
    draft.category !== published.category ||
    draft.targetKeyword !== published.targetKeyword ||
    draft.bodyHtml.replace(/\r\n/g, "\n").trim() !== published.bodyHtml;

  return (
    <form action={formAction} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-5">
        <Field label="Title" hint={`${draft.title.length} characters · the post's only <h1>`}>
          <input
            name="title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            className={fieldClass}
          />
        </Field>

        <Field
          label="Meta description"
          hint={`${draft.metaDescription.length} characters · search-result snippet, plain text`}
        >
          <textarea
            name="metaDescription"
            rows={3}
            value={draft.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
            className={`${fieldClass} resize-y`}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" hint="groups the blog index">
            <input
              name="category"
              list={CATEGORY_LIST_ID}
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Target keyword" hint="lowercase">
            <input
              name="targetKeyword"
              value={draft.targetKeyword}
              onChange={(e) => set("targetKeyword", e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
        <datalist id={CATEGORY_LIST_ID}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <Field
          label="Body HTML"
          hint={`${wordCount(draft.bodyHtml)} words · rendered into the live page unsanitised`}
        >
          <textarea
            name="bodyHtml"
            rows={26}
            spellCheck={false}
            value={draft.bodyHtml}
            onChange={(e) => set("bodyHtml", e.target.value)}
            className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="intent"
            value="preview"
            disabled={pending}
            className={buttonClass}
          >
            {pending ? "Checking…" : "Check & preview"}
          </button>
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending || !dirty}
            className={primaryButtonClass}
          >
            Save &amp; publish
          </button>
          <button
            type="button"
            onClick={() => setDraft(published)}
            disabled={pending || !dirty}
            className={`${buttonClass} disabled:opacity-40`}
          >
            Revert
          </button>
          <span className="text-xs text-black/50 dark:text-white/50">
            {dirty ? "Unsaved changes" : "Matches what is published"}
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {state.status !== "idle" ? (
          <div className={`rounded-xl border p-4 text-sm ${statusTone(state.status)}`}>
            <p className="font-medium">{state.message}</p>
            <div className="mt-3">
              <VerdictList
                problems={state.problems}
                warnings={state.warnings}
                okLabel="Every check in scripts/seo/validate.mjs passed."
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-black/15 p-4 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            <p className="font-medium text-black/70 dark:text-white/70">Nothing checked yet</p>
            <p className="mt-1">
              Press <span className="font-medium">Check &amp; preview</span> to run the same
              validator the content pipeline uses and see the post as a reader would. Saving runs it
              again on the server and refuses anything it rejects.
            </p>
          </div>
        )}

        {state.previewHtml !== null ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <span>
                Preview ·{" "}
                {state.status === "saved" ? "now live" : "not written"}
              </span>
              <span className="tabular-nums">{wordCount(state.previewHtml)} words</span>
            </div>
            {/* Same wrapper the public page uses: a single <h1> for the title,
                then .article-body around the stored HTML. Rendering it any other
                way would preview a layout the reader will never see.

                dangerouslySetInnerHTML is deliberate and matched to
                app/blog/[slug]/page.tsx. What makes it safe HERE is the order of
                operations: this string is only ever one the server has already
                run through the validator — no <script>, no event handlers, no
                remote src or href, allowed tags only — and the action returns
                null instead of HTML for anything that failed. */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{draft.title}</h1>
              <div
                className="article-body mt-6"
                dangerouslySetInnerHTML={{ __html: state.previewHtml }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}

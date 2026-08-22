// The shape passed between the editor form and its Server Action.
//
// Separate from actions.ts because a "use server" module may only export async
// functions — a plain constant like INITIAL_EDITOR_STATE exported from there is
// a build error. Keeping the vocabulary in its own module also means the client
// component can import the state type without pulling the action's server
// imports (Prisma, the validator) into its dependency graph.

export type EditorDraft = {
  title: string;
  metaDescription: string;
  category: string;
  targetKeyword: string;
  bodyHtml: string;
};

export type EditorState = {
  /**
   * idle    — nothing submitted yet
   * preview — validated, not written; `previewHtml` is set
   * saved   — written
   * refused — validation failed, nothing written
   * error   — the row is gone, or the write itself failed
   */
  status: "idle" | "preview" | "saved" | "refused" | "error";
  message: string;
  problems: string[];
  warnings: string[];
  /**
   * Set only when validation passed. The editor renders it; a body with any
   * problem is never handed back for rendering, so the preview pane cannot
   * become the place where malformed markup gets exercised.
   */
  previewHtml: string | null;
  /** Whether the submitted draft differs from the stored row. */
  dirty: boolean;
};

export const INITIAL_EDITOR_STATE: EditorState = {
  status: "idle",
  message: "",
  problems: [],
  warnings: [],
  previewHtml: null,
  dirty: false,
};

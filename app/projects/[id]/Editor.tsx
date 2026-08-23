"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PENDING_PROMPT_KEY, PENDING_PROMPT_IMAGE_KEY } from "@/lib/pending-prompt";
import BrandKitPanel from "@/components/brand/BrandKitPanel";
import { Mark } from "@/components/marketing/Logo";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { Menu } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import BuildingOverlay from "./BuildingOverlay";
import BuildInterrupted, { type Interruption } from "./BuildInterrupted";
import ChatLog, { AssistantStatus, type Applied, type Suggestion } from "./ChatLog";
import CodePanel from "./CodePanel";
import CommandPalette, { type CommandGroup } from "./CommandPalette";
import Composer from "./Composer";
import type { CreditRange } from "./CostEstimate";
import DiffView from "./DiffView";
import HistoryPanel, { type BuildCheckpoint } from "./HistoryPanel";
import PreviewFrame, { DEVICES, type DeviceId } from "./PreviewFrame";
import SelectionPanel from "./SelectionPanel";
import SeoPanel from "./SeoPanel";
import {
  buildHeadline,
  parseStreamEvent,
  reduceBuild,
  startRun,
  type BuildRun,
} from "./build-steps";
import { loadBuildDiff } from "./diff-actions";
import type { BuildDiff } from "./diff";
import {
  PREVIEW_NS,
  buildPreviewDocument,
  normalizeSelection,
  selectionReference,
  type SelectedElement,
  type SelectionMove,
} from "./preview-agent";

type Message = { role: string; content: string };

// ---------------------------------------------------------------------------
// Undo / redo.
//
// There is exactly one restorable state in this product: a successful build's
// `filesSnapshot`. Nothing else is versioned — a Brand or SEO save overwrites
// the draft files in place, and no route can write an arbitrary tree back. So
// undo is defined over CHECKPOINTS, and this comment is the honest statement of
// what that does and does not give you:
//
//   * Undoing a build restores the checkpoint before it.
//   * Undoing a manual edit (Brand / SEO) restores the checkpoint it was made
//     on top of — so the edit is undone, but as a side effect of putting the
//     whole tree back, not because the edit itself was recorded.
//   * A manual edit therefore CANNOT BE REDONE. Nothing captured it. Redo says
//     so rather than offering a button that would silently do something else.
//
// `cursor` is the checkpoint the draft matches. Within a session it is a fact:
// every move is one this component performed itself. Across a reload it is
// seeded from an exact server-side tree comparison (page.tsx) that can answer
// only one question — "does the draft match the NEWEST checkpoint?" — because
// answering it for every checkpoint would mean loading every snapshot.
//
// So a reloaded page knows either "the draft is at the newest checkpoint" or
// "the draft is somewhere else", and NOT where else. That is why the
// off-checkpoint label says "restore the last build" rather than "go back":
// after a restore-then-reload the newest checkpoint is forwards, not
// backwards, and a button claiming otherwise would be wrong. Restoring the
// last build is a true description of the click in both cases.
//
// A checkpoint can also vanish underneath all of this: lib/retention.ts clears
// old snapshots, and the checkpoint list only ever contains surviving ones. So
// every target is re-checked at click time and a 404 is reported as what it is.
// ---------------------------------------------------------------------------
type UndoTarget =
  | {
      kind: "ready";
      build: BuildCheckpoint;
      /** The draft is not on a checkpoint, so undo restores the one it is at. */
      offCheckpoint: boolean;
    }
  | { kind: "unavailable"; reason: string };

type Props = {
  projectId: string;
  projectName: string;
  slug: string;
  published: boolean;
  initialFiles: Record<string, string>;
  initialMessages: Message[];
  initialBalance: number;
  /** This user's measured average credits per build — see lib/credits.ts. */
  avgBuildCredits: number;
  /**
   * How many of this user's builds have actually been charged. `avgBuildCredits`
   * is a global fallback until this is above zero, so it is what decides whether
   * the pre-flight estimate may call that number "your" average.
   */
  measuredBuilds: number;
  /** estimateCredits() for both build kinds, resolved server-side in page.tsx. */
  estimates: { create: CreditRange; edit: CreditRange };
  /** Unread, non-spam form submissions — the badge on the Submissions link. */
  unreadSubmissions: number;
  /**
   * Successful builds whose snapshot still exists, newest first. Both the
   * History panel and the undo timeline read this one list, so they can never
   * disagree about what a checkpoint is.
   */
  initialCheckpoints: BuildCheckpoint[];
  /**
   * Does the draft differ from the newest checkpoint? Resolved by comparing the
   * actual trees server-side — see page.tsx. True means a manual Brand/SEO save
   * (or a restore) happened after the last build, which changes what Undo does.
   */
  draftDiffersFromLatest: boolean;
};

const SITES_BASE = process.env.NEXT_PUBLIC_SITES_BASE ?? "kodely.site";

/** The five panels the right-hand side can show. `diff` is deliberately NOT
    one of them — it is a transient overlay with its own Close, so dismissing it
    returns to the tab you were on rather than guessing "preview". */
type View = "preview" | "code" | "history" | "seo" | "brand";

const VIEWS: { id: View; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "code", label: "Code" },
  { id: "history", label: "History" },
  { id: "seo", label: "SEO" },
  { id: "brand", label: "Brand" },
];

// Thrown for an `error` event the SERVER sent us, so the catch below can tell
// "the build failed and told us why" apart from "the pipe broke" — which are
// completely different messages to the user. Anything else that surfaces after
// streaming has begun is transport, not the build.
class BuildServerError extends Error {}

// Refused by the route BEFORE it wrote anything — the kill switch, an empty
// balance, the spend cap or the rate limit, all of which answer non-2xx ahead
// of the Build row and ahead of the user's Message row. Its own class because
// it is the only failure a plain "Try again" is honest about: once the route
// has answered 200 the user's message is persisted, so re-sending is a
// follow-up edit against a half-built site, not a clean re-run.
class RefusedError extends Error {}

// The platform never changes under us, so there is nothing to subscribe to —
// but reading navigator or location during render would make the server and
// client disagree. useSyncExternalStore with a server snapshot is the
// sanctioned way to say "assume X on the server, correct it on the client",
// and unlike a setState-in-effect it cannot produce a hydration mismatch.
const NO_SUBSCRIBE = () => () => {};
const isMacClient = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const isMacServer = () => false;

// Mirrors the publish route's own Host-based derivation (see the comment
// there) so the header's "live site" link always matches what publish
// actually returned, on staging or prod, without hardcoding either.
function liveSiteUrl(slug: string): string {
  if (typeof window === "undefined") return `https://${slug}.${SITES_BASE}`;
  const host = window.location.host;
  return host.includes("staging")
    ? `${window.location.origin}/api/site/${slug}`
    : `https://${slug}.${SITES_BASE}`;
}

/** Follow-ups. Plain prompt text — nothing here is model-generated and nothing
    submits on its own; picking one fills the box so it can be edited first.
    They change with the only context we actually have: whether a site exists,
    whether the last attempt failed, how many pages there are, and whether an
    element is selected. */
function suggestionsFor({
  isFirstBuild,
  failed,
  pageCount,
  selection,
}: {
  isFirstBuild: boolean;
  failed: boolean;
  pageCount: number;
  selection: SelectedElement | null;
}): Suggestion[] {
  if (isFirstBuild) {
    return [
      {
        id: "s-cafe",
        label: "A neighbourhood coffee shop",
        prompt:
          "A one-page site for a neighbourhood coffee shop — warm and unfussy, with the story, the menu and how to find us.",
      },
      {
        id: "s-saas",
        label: "A landing page for my SaaS",
        prompt:
          "A landing page for a SaaS product: a clear promise at the top, three reasons to care, and one obvious call to action.",
      },
      {
        id: "s-portfolio",
        label: "A portfolio for my work",
        prompt:
          "A portfolio site for an independent designer — a short introduction, selected projects, and a way to get in touch.",
      },
    ];
  }

  if (failed) {
    return [
      {
        id: "s-simpler",
        label: "Ask for something simpler",
        prompt: "Make the same change, but keep it simple — change as little as possible.",
      },
    ];
  }

  if (selection) {
    return [
      {
        id: "s-sel-copy",
        label: "Rewrite the selected text",
        prompt: `Rewrite the copy in ${selectionReference(selection)} to be shorter and more specific.`,
      },
      {
        id: "s-sel-style",
        label: "Restyle the selection",
        prompt: `Restyle ${selectionReference(selection)} so it stands out more, without changing the rest of the page.`,
      },
    ];
  }

  const base: Suggestion[] = [
    {
      id: "s-palette",
      label: "Try a different palette",
      prompt: "Try a different colour palette — same layout, a warmer and more confident feel.",
    },
    {
      id: "s-hero",
      label: "Strengthen the opening",
      prompt: "Make the top of the page stronger: a sharper headline and one clear call to action.",
    },
    {
      id: "s-contact",
      label: "Add a way to get in touch",
      prompt:
        "Add a contact section with a mailto: link and a tel: link — no form, since there is no backend.",
    },
  ];
  if (pageCount <= 1) {
    base.push({
      id: "s-about",
      label: "Add an About page",
      prompt: "Add a separate About page at /about with its own title and description.",
    });
  }
  return base;
}

export default function Editor(props: Props) {
  const [messages, setMessages] = useState<Message[]>(props.initialMessages);
  const [files, setFiles] = useState(props.initialFiles);
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The live build, or null. THE source of every progress step on screen —
  // driven only by SSE events, never by a timer. See build-steps.ts.
  const [run, setRun] = useState<BuildRun | null>(null);
  // The assistant's reply as it streams. Cleared unless the build completes:
  // the route persists it only in the success branch, so keeping it after an
  // interruption would leave a message on screen that a reload deletes.
  const [streamed, setStreamed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Is "Try again" an honest offer for THIS error? Only when the route refused
  // before it wrote anything (see RefusedError). /api/generate persists the
  // user's Message row before it starts streaming, so after a mid-build
  // failure a re-send is classified `edit` against a half-written site — which
  // is not what "try again" means to anybody.
  const [retryable, setRetryable] = useState(false);
  const [balance, setBalance] = useState(props.initialBalance);
  // The build that finished in THIS session, plus what the route told us it
  // cost. Deliberately not restored on reload: rating a build you last saw
  // yesterday is guesswork.
  const [applied, setApplied] = useState<Applied | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [published, setPublished] = useState(props.published);
  // Local, like `published` above and for the same reason: the subdomain can
  // change after this page rendered (the SEO panel's address editor), and
  // every place that reads it — the live URL, the download filename, the
  // command palette — has to see the new one without a full reload.
  const [slug, setSlug] = useState(props.slug);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<View>("preview");
  // Chat and preview cannot share a phone screen. See the note on the layout
  // grid at the bottom of this file for why this is a swap and not a sheet.
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [builds, setBuilds] = useState<BuildCheckpoint[]>(props.initialCheckpoints);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BuildCheckpoint | null>(null);
  // Which checkpoint the draft matches, and whether something unversioned sits
  // on top of it. See the block comment above UndoTarget.
  const [cursor, setCursor] = useState<string | null>(props.initialCheckpoints[0]?.id ?? null);
  const [dirty, setDirty] = useState(props.draftDiffersFromLatest);
  // Checkpoints stepped off by Undo, oldest-first. Cleared by anything that
  // makes "forward" ambiguous — a new build, or a manual edit.
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [timeTravelling, setTimeTravelling] = useState(false);
  // A transient overlay over whichever tab is open, not a tab of its own.
  const [diffBuild, setDiffBuild] = useState<string | null>(null);
  const [diff, setDiff] = useState<BuildDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  // Only the newest diff request may write state — opening two in quick
  // succession must not let the slower one win.
  const diffRequest = useRef(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  // The prompt as typed, held only while an expanded spec sits in the box.
  // Doubles as the "we're showing a spec" flag and as what Revert restores.
  const [enhancedFrom, setEnhancedFrom] = useState<string | null>(null);
  // A build that ended without finishing — stopped on purpose, or the stream
  // died. Not `error`: nothing went wrong, so it must not read like a failure.
  const [interruption, setInterruption] = useState<Interruption | null>(null);
  // Did we actually SEE the build write anything before it was interrupted?
  // Rendered state because BuildInterrupted's copy depends on it — see the
  // engine note at the top of that file for why it cannot be assumed.
  const [wroteFiles, setWroteFiles] = useState(false);
  const [device, setDevice] = useState<DeviceId>("desktop");
  // --- click-to-select -----------------------------------------------------
  // The assembled, self-contained preview document (see preview-agent.ts).
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Build paths index.html referenced that we could not inline. Not fatal, but
  // the preview is then missing something and must not pretend otherwise.
  const [previewMissing, setPreviewMissing] = useState<string[]>([]);
  // The agent inside the preview has answered. Until it has, the Select
  // element toggle stays disabled rather than looking live and doing nothing.
  const [previewReady, setPreviewReady] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<SelectedElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Read inside the message listener, which is registered once — a piece of
  // state there would need the listener rebound on every toggle.
  const selectModeRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Abort has been requested but the stream hasn't unwound yet. Rendered
  // state, not just the ref below, so the button can actually go dead.
  const [stopping, setStopping] = useState(false);
  const streamingReply = useRef("");
  // The text of the last build we started, so Retry and "try again
  // differently" have something real to re-send.
  const lastPrompt = useRef<string | null>(null);
  // Aborting this is what the Stop button does; the route's stream cancel()
  // sees the disconnect and aborts the model call on the server side.
  const abortRef = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  // What had focus when the palette opened, so closing can hand it back.
  const paletteReturn = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const toast = useToast();

  const modKey = useSyncExternalStore(NO_SUBSCRIBE, isMacClient, isMacServer) ? "⌘" : "Ctrl";
  // Same reason as modKey: the staging host changes the answer and reading
  // window during render would tear on hydration.
  const siteHost = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => liveSiteUrl(slug).replace(/^https?:\/\//, ""),
    () => `${slug}.${SITES_BASE}`,
  );

  async function refreshFiles() {
    const res = await fetch(`/api/projects/${props.projectId}`);
    const body = await res.json();
    setFiles(
      Object.fromEntries(
        (body.project?.files ?? []).map((f: { path: string; content: string }) => [f.path, f.content]),
      ),
    );
    setPreviewNonce((n) => n + 1);
  }

  // Re-reads the checkpoint list from the same route the History panel has
  // always used, so the undo timeline and History are literally the same data.
  // That route already filters out builds whose snapshot the retention job has
  // cleared, which is why a pruned checkpoint simply stops being offered.
  async function refreshCheckpoints() {
    const res = await fetch(`/api/projects/${props.projectId}/builds`);
    const body = await res.json();
    setBuilds(body.builds ?? []);
  }

  async function openHistory() {
    setView("history");
    setMobileTab("preview");
    // The list is seeded from the server on page load, so this is a refresh,
    // not a first load — it deliberately does not blank what is on screen.
    await refreshCheckpoints().catch(() => {});
  }

  // The one place a checkpoint is written back over the draft. Restore, Undo
  // and Redo are all this call plus different bookkeeping — sharing it is what
  // stops them drifting apart on the two things that are easy to get wrong: the
  // file/preview refresh, and what a 404 means.
  async function applyCheckpoint(buildId: string) {
    const res = await fetch(`/api/projects/${props.projectId}/builds/${buildId}/restore`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        // The snapshot was reclaimed between this list being loaded and the
        // click. Nothing is broken and nothing was lost from the draft — but
        // the control must stop offering it, so drop it from both timelines.
        await refreshCheckpoints().catch(() => {});
        setRedoStack((stack) => stack.filter((id) => id !== buildId));
        throw new Error(
          "That checkpoint's files have been cleared to save storage, so it can no longer be restored.",
        );
      }
      throw new Error(body?.error ?? "Restore failed.");
    }
    await refreshFiles();
  }

  async function restore(build: BuildCheckpoint) {
    setConfirmRestore(null);
    setRestoring(build.id);
    setError(null);
    try {
      await applyCheckpoint(build.id);
      // Jumping to an arbitrary point makes "forward" meaningless, so redo is
      // dropped rather than left pointing at a branch the user abandoned.
      setCursor(build.id);
      setDirty(false);
      setRedoStack([]);
      setView("preview");
      toast({ tone: "ok", message: "Checkpoint restored to your draft." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(null);
    }
  }

  async function undo() {
    if (undoTarget.kind !== "ready" || timeTravelling) return;
    const target = undoTarget.build;
    const from = cursor;
    const wasDirty = dirty;
    setTimeTravelling(true);
    setError(null);
    try {
      await applyCheckpoint(target.id);
      setCursor(target.id);
      setDirty(false);
      // Undoing a manual edit has nothing to redo — the edit was never
      // captured anywhere. Undoing a build steps off a real checkpoint, which
      // is exactly what redo needs.
      setRedoStack((stack) => (wasDirty || from === null ? [] : [...stack, from]));
      setView("preview");
      // The card describing the undone build would now be describing something
      // that is no longer in the draft.
      setApplied(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed.");
    } finally {
      setTimeTravelling(false);
    }
  }

  async function redo() {
    if (redoTarget.kind !== "ready" || timeTravelling) return;
    const target = redoTarget.build;
    setTimeTravelling(true);
    setError(null);
    try {
      await applyCheckpoint(target.id);
      setCursor(target.id);
      setDirty(false);
      setRedoStack((stack) => stack.filter((id) => id !== target.id));
      setView("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redo failed.");
    } finally {
      setTimeTravelling(false);
    }
  }

  async function openDiff(buildId: string) {
    const token = ++diffRequest.current;
    setDiffBuild(buildId);
    setMobileTab("preview");
    setDiff(null);
    setDiffError(null);
    setDiffLoading(true);
    try {
      const result = await loadBuildDiff(props.projectId, buildId);
      if (token !== diffRequest.current) return;
      if (result.ok) setDiff(result.diff);
      else setDiffError(result.error);
    } catch {
      // A Server Action that throws reaches the client as an opaque error, so
      // there is nothing more specific to say than this.
      if (token === diffRequest.current) setDiffError("Couldn't load the changes for this build.");
    } finally {
      if (token === diffRequest.current) setDiffLoading(false);
    }
  }

  // Brand and SEO write draft files directly and are not checkpointed. Undo can
  // still put them back — by restoring the checkpoint they were made on top of
  // — but nothing can replay them, so redo is cleared here rather than left
  // offering a step that would skip the edit.
  async function onManualSave() {
    await refreshFiles();
    setDirty(true);
    setRedoStack([]);
  }

  // The foundation means source files are never empty — "first build" means
  // no chat history yet, matching the same signal the generate route uses.
  const isFirstBuild = messages.length === 0;
  // Every .html at the project root is a real page with its own <head>. More
  // than one means the preview (which is index.html alone) is showing part of
  // the site, and PreviewFrame says so.
  const pageCount = Object.keys(files).filter((p) => p.endsWith(".html")).length;

  // Where the draft sits on the checkpoint timeline. Derived every render from
  // `builds` + `cursor` + `dirty` rather than stored, so a refreshed list that
  // has dropped a pruned snapshot immediately disables the control that pointed
  // at it instead of leaving a stale target behind.
  const cursorIndex = cursor === null ? -1 : builds.findIndex((b) => b.id === cursor);

  const undoTarget: UndoTarget = (() => {
    if (cursorIndex < 0) {
      return {
        kind: "unavailable",
        reason:
          builds.length === 0
            ? "nothing to undo yet"
            : "the checkpoint this draft came from has been cleared",
      };
    }
    // Off a checkpoint, the step available is back onto the one the cursor
    // names — which is the last build, whether the draft drifted from it via a
    // Brand/SEO save or was moved off it by a restore in an earlier session.
    if (dirty) return { kind: "ready", build: builds[cursorIndex], offCheckpoint: true };
    const older = builds[cursorIndex + 1];
    return older
      ? { kind: "ready", build: older, offCheckpoint: false }
      : { kind: "unavailable", reason: "this is the first checkpoint" };
  })();

  const redoTarget: UndoTarget = (() => {
    const top = redoStack[redoStack.length - 1];
    if (top === undefined) return { kind: "unavailable", reason: "nothing to redo" };
    const build = builds.find((b) => b.id === top);
    return build
      ? { kind: "ready", build, offCheckpoint: false }
      : { kind: "unavailable", reason: "that checkpoint has been cleared" };
  })();

  const undoHint =
    undoTarget.kind === "ready"
      ? undoTarget.offCheckpoint
        ? `restore the last build — “${undoTarget.build.prompt}”`
        : `undo “${undoTarget.build.prompt}”`
      : undoTarget.reason;

  // -------------------------------------------------------------------------
  // Assemble the preview document.
  //
  // The build output is fetched HERE, from the editor page, because this is the
  // only context where those requests carry the session cookie. A request made
  // from inside the sandboxed frame is treated as cross-site and arrives
  // without it — verified, and the reason the frame is fed `srcdoc` rather than
  // pointed at /api/preview directly. See preview-agent.ts.
  // -------------------------------------------------------------------------
  // Reset during render rather than in the effect below. A new nonce means a
  // new document, so the handshake, the selection and the pick mode all belong
  // to a page that no longer exists — and React's own guidance is to adjust
  // state while rendering when it derives from a changed value, not to fire an
  // effect and re-render a second time.
  const [docNonce, setDocNonce] = useState(previewNonce);
  if (docNonce !== previewNonce) {
    setDocNonce(previewNonce);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewMissing([]);
    setPreviewReady(false);
    setSelection(null);
    setSelectMode(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/preview/${props.projectId}`;

    (async () => {
      try {
        const res = await fetch(`${base}/index.html`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("The preview could not be loaded. Try reloading the page.");
        const built = await buildPreviewDocument(await res.text(), async (path) => {
          const asset = await fetch(`${base}/${path}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          return asset.ok ? await asset.text() : null;
        });
        if (controller.signal.aborted) return;
        setPreviewDoc(built.doc);
        setPreviewMissing(built.missing);
      } catch (err) {
        if (controller.signal.aborted) return;
        setPreviewError(
          err instanceof Error ? err.message : "The preview could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    })();

    return () => controller.abort();
  }, [props.projectId, previewNonce]);

  useEffect(() => {
    selectModeRef.current = selectMode;
  }, [selectMode]);

  // The tab title is the only progress signal that survives switching away
  // from the tab, which is exactly what people do during a 90-second build.
  // Same source as everything else on screen — no separate wording to drift.
  //
  // Only while it is RUNNING. A failed run now stays on screen as a frozen
  // step list until it is dismissed, and buildHeadline() renders any non-
  // running outcome as "Build failed" — which would put those words in the tab
  // for a dropped connection, where nobody knows whether the build failed. The
  // card on screen says the precise thing; the title stops claiming anything.
  useEffect(() => {
    document.title =
      run && run.outcome === "running"
        ? `${buildHeadline(run)} — ${props.projectName}`
        : `${props.projectName} — Kodely`;
  }, [run, props.projectName]);

  // targetOrigin MUST be "*". The frame's origin is opaque, so posting to an
  // exact origin is silently dropped and "null" throws — both verified.
  function postToPreview(msg: Record<string, unknown>) {
    frameRef.current?.contentWindow?.postMessage({ ...msg, ns: PREVIEW_NS }, "*");
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // `event.origin` is the literal string "null" here, so it authenticates
      // nothing. Source identity is the only check worth making — and even
      // that only proves the message came FROM the preview, not that our agent
      // sent it, which is why the payload is re-validated below.
      const frame = frameRef.current;
      if (!frame || !event.source || event.source !== frame.contentWindow) return;

      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || data.ns !== PREVIEW_NS) return;

      if (data.type === "ready") {
        setPreviewReady(true);
        // A remount gives us a fresh document with the agent in its default
        // state; re-assert the mode the user had switched on.
        if (selectModeRef.current) postToPreview({ cmd: "set-mode", on: true });
        return;
      }
      if (data.type === "mode") {
        // The frame owns this: Escape inside the preview turns it off.
        setSelectMode(data.on === true);
        return;
      }
      if (data.type === "cleared") {
        setSelection(null);
        return;
      }
      if (data.type === "selected") {
        const el = normalizeSelection(data.el);
        if (el) setSelection(el);
      }
    }

    // Registered once: everything it touches is a ref or a setter, so the
    // listener never needs rebinding.
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // A fallback handshake. The agent announces itself unprompted, so this only
  // matters if that message raced the frame's ref being attached. It stops as
  // soon as the preview answers, and gives up rather than polling forever.
  useEffect(() => {
    if (!previewDoc || previewReady) return;
    const ping = window.setInterval(() => postToPreview({ cmd: "ping" }), 300);
    const giveUp = window.setTimeout(() => window.clearInterval(ping), 5000);
    return () => {
      window.clearInterval(ping);
      window.clearTimeout(giveUp);
    };
  }, [previewDoc, previewReady]);

  function toggleSelectMode() {
    const next = !selectMode;
    setSelectMode(next);
    postToPreview({ cmd: "set-mode", on: next });
  }

  function moveSelection(dir: SelectionMove) {
    postToPreview({ cmd: "move", dir });
  }

  function clearSelection() {
    setSelection(null);
    postToPreview({ cmd: "clear" });
  }

  // Deliberately does NOT change mobileTab. The composer sits in its own grid
  // row below the tab swap and is present on BOTH mobile tabs, so the box this
  // focuses is already on screen either way — and switching would contradict
  // the rule stated on the layout grid below: nothing yanks the customer to
  // another tab. It matters most for the two callers that fire from the
  // preview side (the selection panel's "Describe a change to this", and the
  // empty state's button): jumping to Chat there would hide the very thing
  // they were pointing at.
  function focusPrompt() {
    requestAnimationFrame(() => {
      const box = promptRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }

  // Puts a precise reference to the selected element at the front of the
  // prompt. It does NOT edit anything — the change still goes through a normal
  // build, and the copy in SelectionPanel says so.
  function insertSelectionReference() {
    if (!selection) return;
    const reference = `Change ${selectionReference(selection)}: `;
    setPrompt((current) => (current.startsWith(reference) ? current : reference + current));
    setEnhancedFrom(null);
    focusPrompt();
  }

  function useSuggestion(s: Suggestion) {
    setPrompt(s.prompt);
    setEnhancedFrom(null);
    focusPrompt();
  }

  // If the visitor typed a prompt on the homepage (or picked a template, or
  // finished the wizard) before hitting the auth wall, that prompt survives
  // login/signup in sessionStorage — see lib/pending-prompt.ts, whose
  // destinationAfterAuth() creates the project and sends them straight here.
  // Fire it automatically instead of making them retype what they already told
  // us. This is the one path that still runs a FIRST build inside the builder;
  // see the note at the top of BuildingOverlay.tsx.
  //
  // ── THE DOUBLE-FIRE GUARD ────────────────────────────────────────────────
  // This spends money, so the guard is worth stating rather than inferring.
  // The KEY IS REMOVED BEFORE send() IS CALLED, and both are synchronous. That
  // ordering — not the empty dependency array — is what makes a second run a
  // no-op, which matters because React StrictMode invokes every effect twice
  // in development: run one reads the prompt, clears it and starts the fetch;
  // run two reads null and returns at the `if (!pending)` line above send().
  //
  // The other two guards are real but secondary. `isFirstBuild` is evaluated
  // from the mount-time render, so it cannot flip mid-effect. `send()`'s own
  // `if (!text || busy) return` cannot help here at all — `busy` is captured
  // from the mount closure and is still false on the second run — which is
  // precisely why the ordering above has to carry the weight.
  useEffect(() => {
    if (!isFirstBuild) return;
    let pending: string | null = null;
    let pendingImage: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_PROMPT_KEY);
      pendingImage = sessionStorage.getItem(PENDING_PROMPT_IMAGE_KEY);
    } catch {}
    if (!pending) return;
    try {
      sessionStorage.removeItem(PENDING_PROMPT_KEY);
      sessionStorage.removeItem(PENDING_PROMPT_IMAGE_KEY);
    } catch {}
    send(pending, pendingImage ?? undefined);
    // Runs once on mount only — send() is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(overrideText?: string, overrideImage?: string) {
    const text = (overrideText ?? prompt).trim();
    if (!text || busy) return;
    if (balance <= 0) {
      setError("You're out of credits. Top up to keep building.");
      return;
    }

    const attachment = overrideImage ?? image ?? undefined;
    // Fixed HERE, not read later: `isFirstBuild` flips the moment the user's
    // message joins the list, and the running build's steps must not relabel
    // themselves mid-flight.
    const kind = isFirstBuild ? "create" : "edit";
    let current = startRun(kind);

    setBusy(true);
    setRun(current);
    setError(null);
    setRetryable(false);
    setInterruption(null);
    setApplied(null);
    setWroteFiles(false);
    setStreamed("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setPrompt("");
    setImage(null);
    setEnhancedFrom(null);
    lastPrompt.current = text;
    streamingReply.current = "";
    stopRequested.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // A `done` or `error` event. The route always sends one of them unless it
    // saw the client go away, so a stream that closes without either IS the
    // signature of a dropped connection.
    let sawTerminal = false;
    // This build ended as an INTERRUPTION (stopped on purpose, or the stream
    // died) rather than as a reported failure. Both reduce the run to `failed`
    // — that is the only terminal the reducer has — but they must not leave the
    // frozen step list on screen, because AIProgress marks the step it stopped
    // on with a ✕ and that is a claim neither case can support: a Stop is
    // something the customer asked for, and a dropped stream leaves a build
    // that may well have run to completion server-side. BuildInterrupted says
    // the true thing for both. Only an `error` the server actually reported
    // earns the failed list.
    let interrupted = false;
    let touchedFiles = false;
    // The checkpoint this build created, once it has actually succeeded. Read
    // after the stream to move the undo cursor — a state setter can't be read
    // back here, and an interrupted build never reaches the `done` event, so
    // this is also what keeps a failed build from moving the cursor.
    let finishedBuildId: string | null = null;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: props.projectId, prompt: text, image: attachment }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        // A non-2xx means route.ts refused before it wrote anything: the kill
        // switch, the balance, the spend cap or the rate limit turned it away
        // ahead of the Build row and ahead of the user's Message row. That —
        // and only that — is what makes a retry a clean re-run rather than a
        // follow-up edit. See the note on `retryable`.
        throw new RefusedError(body?.error ?? "The build failed to start.");
      }

      // 200 with a body: a Build row and the user's Message row now exist
      // server-side. Everything after this point is a build that really began.
      current = reduceBuild(current, { kind: "accepted" });
      setRun(current);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          // Narrowed rather than cast. A malformed or unrecognised frame must
          // not throw inside this loop — that would abandon a build that is
          // otherwise going fine — so it is skipped instead.
          let event;
          try {
            event = parseStreamEvent(JSON.parse(part.slice(6)));
          } catch {
            continue;
          }
          if (!event) continue;

          // Every step on screen comes from this one call. Reduced into a
          // local first and flushed once per network chunk below, so a burst
          // of twenty deltas is one React render rather than twenty.
          current = reduceBuild(current, { kind: "sse", event });

          if (event.type === "text") {
            streamingReply.current += event.text;
          } else if (event.type === "file") {
            // On the SDK engine these all arrive at once after the build, so
            // they are a completion signal, not live progress — the narration
            // line is what the user actually watches. On the `api` engine they
            // arrive one per write, which is what makes them usable as
            // evidence that a stopped build left files behind.
            touchedFiles = true;
            setWroteFiles(true);
          } else if (event.type === "done") {
            sawTerminal = true;
            setBalance(event.remaining);
            finishedBuildId = event.buildId;
            if (finishedBuildId) {
              setApplied({
                buildId: finishedBuildId,
                filesWritten: event.filesWritten,
                credits: event.credits,
                repairWaived: event.repairWaived,
                waivedCredits: event.waivedCredits,
              });
            }
          } else if (event.type === "error") {
            sawTerminal = true;
            throw new BuildServerError(event.message);
          }
        }

        setRun(current);
        setStreamed(streamingReply.current);
      }

      if (!sawTerminal) {
        // The pipe closed mid-build. Nothing was thrown, no error arrived —
        // this is exactly the silent stop the user used to be left staring at.
        //
        // Reduced to `failed` rather than just left alone: that is what
        // BuildSignal documents this case as, and it is what freezes the step
        // list on the step it died on instead of clearing it. A run left
        // `running` here would be cleared by the finally block below and the
        // customer would never see how far it got.
        current = reduceBuild(current, { kind: "failed" });
        interrupted = true;
        setInterruption("connection-lost");
        setStreamed(null);
      } else if (streamingReply.current.trim()) {
        // Only on a build that actually completed: the route persists the
        // assistant reply in the success branch alone, so showing it after an
        // interruption would put a message on screen that a reload deletes.
        // Moved into the permanent list here, so the streaming copy goes.
        setMessages((m) => [...m, { role: "assistant", content: streamingReply.current.trim() }]);
        setStreamed(null);
      } else {
        setStreamed(null);
      }
      // Deliberately swallowed. This runs AFTER the stream has closed cleanly,
      // so the build is already over and its outcome already decided — letting
      // a failed re-fetch fall into the catch below would report a finished
      // build as a lost connection, which is the one thing that block must
      // never say wrongly. A stale file list is a reload away; a false
      // "connection lost" sends the user hunting for a problem that isn't
      // there.
      if (touchedFiles) await refreshFiles().catch(() => {});
      if (finishedBuildId) {
        // A new checkpoint. The draft matches it exactly, and whatever the user
        // had stepped back from is no longer reachable going forward — they
        // built something else instead, which is what clears a redo stack in
        // every editor that has one.
        //
        // Swallowed for the same reason as the refresh above: the build is over
        // and its outcome decided. A failed refresh leaves the list without the
        // new checkpoint, which the undo control reports honestly as "the
        // checkpoint this draft came from has been cleared" rather than
        // offering a wrong step.
        setCursor(finishedBuildId);
        setDirty(false);
        setRedoStack([]);
        await refreshCheckpoints().catch(() => {});
      }
    } catch (err) {
      setStreamed(null);
      if (stopRequested.current) {
        setInterruption("stopped");
        interrupted = true;
        current = reduceBuild(current, { kind: "failed" });
        // Files the agent wrote before the abort are already committed to the
        // draft source, so pull them in — the Code view should show what is
        // really there, half-finished or not.
        if (touchedFiles) await refreshFiles().catch(() => {});
      } else if (err instanceof RefusedError) {
        // Refused before anything was written. The only failure a plain
        // "Try again" is honest about.
        setError(err.message);
        setRetryable(true);
        current = reduceBuild(current, { kind: "failed" });
      } else if (err instanceof BuildServerError) {
        setError(err.message);
        setRetryable(false);
        current = reduceBuild(current, { kind: "failed" });
      } else if (current.accepted) {
        // The route answered 200 and then the pipe broke — whether that was
        // after twenty frames or before the first byte. Either way a Build row
        // exists server-side and this tab cannot see how it ended, which is
        // exactly what `connection-lost` says.
        //
        // This used to key off "did any bytes arrive", which put a 200 that
        // died before its first frame into the generic-error branch below and
        // had it claim nothing was written — for a build the server had
        // already started. `accepted` is the reducer's own line between
        // "refused before anything happened" and "the server started work";
        // see the field's docstring in build-steps.ts.
        interrupted = true;
        setInterruption("connection-lost");
        current = reduceBuild(current, { kind: "failed" });
      } else {
        // No usable response ever came back — offline, DNS, a proxy. We cannot
        // prove the request never reached the server, so this is neither
        // offered as a clean retry nor described as having changed nothing.
        // ChatLog's copy for this case says so; see `errorAccepted` there.
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setRetryable(false);
        current = reduceBuild(current, { kind: "failed" });
      }
    } finally {
      abortRef.current = null;
      stopRequested.current = false;
      setStopping(false);
      setBusy(false);
      // The list stays on screen only while it is telling the truth. A build
      // the SERVER reported as failed keeps its frozen list, with the ✕ on the
      // step it died on — that is a claim we can support. A success, a stop and
      // a dropped stream all clear it: the first because the applied card
      // replaces it, the other two because a ✕ would assert a failure nobody
      // has established (see `interrupted` above). Dismissing the error strip
      // clears it too, so the conversation is never capped by a dead list.
      setRun(current.outcome === "failed" && !interrupted ? current : null);
    }
  }

  // Stop is a real cancel, not a UI-only one: aborting the fetch closes the
  // response body, which fires cancel() on the route's ReadableStream, which
  // aborts the model request server-side. The build row is then written FAILED
  // with creditsCharged: 0 — nothing is billed. See BuildInterrupted.tsx.
  function stop() {
    if (!busy || stopping || !abortRef.current) return;
    stopRequested.current = true;
    setStopping(true);
    abortRef.current.abort();
  }

  function retry() {
    const text = lastPrompt.current;
    if (!text || !retryable) return;
    setError(null);
    setRetryable(false);
    void send(text);
  }

  // "Regenerate" in the sense other tools mean it does not exist here: the
  // route always appends a new Build, a new Message and a new charge — there
  // is no re-roll of a turn. What IS real is undo-then-resend, so that is what
  // this offers and what its copy says. Only available when undo would land
  // exactly on the checkpoint before this build; anywhere else the same click
  // would discard more than the build being re-run.
  const regenerateBuild =
    applied && cursor === applied.buildId && !dirty && undoTarget.kind === "ready" && !undoTarget.offCheckpoint
      ? builds.find((b) => b.id === applied.buildId) ?? null
      : null;

  const regenerateReason = !applied
    ? ""
    : cursor !== applied.buildId || dirty
      ? "Your draft has moved on from this build, so re-running it here would step over other changes."
      : "There is no earlier checkpoint to step back to, so this build cannot be undone first.";

  async function regenerate() {
    const target = regenerateBuild;
    if (!target || busy || timeTravelling) return;
    await undo();
    void send(target.prompt);
  }

  // Goes through fetch rather than a plain download link so a failure lands in
  // the same error strip as everything else here, instead of silently saving
  // the JSON error body as "slug.zip".
  async function downloadZip() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}/export`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Download failed.");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}.zip`;
      link.click();
      // The click hands the blob off asynchronously, so revoking in the same
      // tick can cancel the download in some browsers. Next tick is enough,
      // and skipping the revoke entirely would pin the archive in memory for
      // the life of the tab.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  // Expand the draft prompt into a spec the user can read and edit before
  // spending anything. The result lands in the prompt box itself — it is
  // already editable, and it is already what the build button reads — so
  // "accept" is just pressing Build, "edit" is typing, "discard" is Revert.
  async function enhance() {
    const text = prompt.trim();
    if (!text || enhancing || busy) return;

    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always the ORIGINAL one-liner, never a spec we already produced —
        // re-expanding an expansion compounds invention instead of adding
        // detail.
        body: JSON.stringify({ prompt: enhancedFrom ?? text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.spec) throw new Error(body?.error ?? "Couldn't expand that.");
      setEnhancedFrom(enhancedFrom ?? text);
      setPrompt(body.spec);
    } catch (err) {
      // Nothing is lost: the typed prompt is still in the box and Build was
      // never disabled by this. Enhance is a convenience, never a gate.
      setError(err instanceof Error ? err.message : "Couldn't expand that.");
    } finally {
      setEnhancing(false);
    }
  }

  function revert() {
    if (enhancedFrom === null) return;
    setPrompt(enhancedFrom);
    setEnhancedFrom(null);
  }

  // Global shortcuts. Deliberately three, all of them either an established
  // convention (⌘K / ⌃⇧P for a palette, "/" to jump to the input) or a
  // disambiguation of a key the box already owns (⌘⏎ builds even when Enter
  // has been handed over to the spec editor). Anything more inventive would
  // be a shortcut nobody discovers and everybody triggers by accident.
  // Bound only while the palette is CLOSED. While it is open the dialog owns
  // the keyboard outright — that is what makes the focus trap and the Escape
  // handling airtight, and it saves reading a "is it open" ref during render.
  useEffect(() => {
    if (paletteOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const openWith = (opener: HTMLElement | null) => {
        paletteReturn.current = opener;
        setPaletteOpen(true);
      };
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && active !== document.body ? active : null;

      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openWith(focused);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        openWith(focused);
        return;
      }
      if (e.key === "/" && !mod && !e.altKey) {
        // "/" is a normal character inside a field — only a jump-to-input
        // shortcut when the user isn't already typing somewhere.
        const typing =
          focused !== null &&
          (focused.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName));
        if (typing) return;
        e.preventDefault();
        promptRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen]);

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}/publish`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Publish failed.");
      setPublished(true);
      // A toast with an action rather than window.open: the open would happen
      // after an await, which popup blockers treat as unrequested. The toast
      // does not auto-dismiss while it carries an action, so the link cannot
      // be lost to a timer either.
      toast({
        tone: "ok",
        message: "Your site is live.",
        action: { label: "Open it", onClick: () => window.open(body.url, "_blank", "noopener") },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  function showCode() {
    setView("code");
    setMobileTab("preview");
    setActiveFile((f) => f ?? Object.keys(files).sort()[0] ?? null);
  }

  function showView(next: View) {
    setView(next);
    setDiffBuild(null);
    setMobileTab("preview");
  }

  function openPalette(opener: HTMLElement | null) {
    paletteReturn.current = opener;
    setPaletteOpen(true);
  }

  // Focus goes back BEFORE the command runs, so a command whose entire job is
  // to move focus (Focus the prompt box) isn't immediately undone by the
  // restore. Falls back to the header trigger if whatever had focus is gone.
  function closePalette(runCommand?: () => void) {
    const previous = paletteReturn.current;
    const target = previous?.isConnected ? previous : paletteTriggerRef.current;
    target?.focus();
    paletteReturn.current = null;
    setPaletteOpen(false);
    runCommand?.();
  }

  const liveHref = published ? liveSiteUrl(slug) : null;
  const assistantState = busy ? "working" : error ? "error" : "ready";
  const suggestions = busy
    ? []
    : suggestionsFor({ isFirstBuild, failed: error !== null, pageCount, selection });

  // Every entry here is a control that already exists elsewhere on this
  // screen. Nothing in the palette can do something the UI cannot.
  const commandGroups: CommandGroup[] = [
    {
      heading: "Build",
      commands: [
        {
          id: "stop",
          label: "Stop the running build",
          keywords: "cancel abort halt",
          hint: "costs 0 credits",
          disabled: !busy || stopping,
          disabledReason: stopping ? "stopping…" : "nothing running",
          run: stop,
        },
        {
          id: "retry",
          label: "Try the last request again",
          keywords: "retry repeat again failed",
          disabled: busy || !retryable,
          disabledReason: busy ? "busy" : "only after a refused request",
          run: retry,
        },
        {
          id: "focus-prompt",
          label: "Focus the prompt box",
          keywords: "write describe change type message",
          hint: "/",
          run: focusPrompt,
        },
      ],
    },
    {
      heading: "View",
      commands: [
        { id: "view-preview", label: "Preview", keywords: "site render", run: () => showView("preview") },
        {
          id: "view-code",
          label: "Code",
          keywords: "files source html",
          disabled: isFirstBuild,
          disabledReason: "after first build",
          run: showCode,
        },
        {
          id: "view-history",
          label: "History",
          keywords: "checkpoints restore versions",
          disabled: isFirstBuild,
          disabledReason: "after first build",
          run: () => void openHistory(),
        },
        {
          id: "view-diff",
          label: "See what the last build changed",
          keywords: "diff changes compare review files lines",
          hint: "no credits",
          disabled: builds.length === 0,
          disabledReason: "no checkpoints yet",
          run: () => {
            if (builds[0]) void openDiff(builds[0].id);
          },
        },
        {
          id: "view-seo",
          label: "Search & social metadata",
          keywords: "seo title meta description og open graph share preview tab",
          hint: "no credits",
          run: () => showView("seo"),
        },
        {
          id: "view-brand",
          label: "Brand kit",
          keywords: "colour color palette font type logo brand identity",
          hint: "no credits",
          run: () => showView("brand"),
        },
      ],
    },
    {
      heading: "Undo",
      commands: [
        {
          id: "undo",
          label:
            undoTarget.kind === "ready" && undoTarget.offCheckpoint
              ? "Undo — restore the last build"
              : "Undo the last change",
          keywords: "revert back rollback checkpoint restore previous mistake",
          hint: undoTarget.kind === "ready" ? "no credits" : undefined,
          disabled: undoTarget.kind !== "ready" || busy || timeTravelling,
          disabledReason:
            busy || timeTravelling ? "busy" : undoTarget.kind === "ready" ? "" : undoTarget.reason,
          run: () => void undo(),
        },
        {
          id: "redo",
          label: "Redo",
          keywords: "forward again reapply",
          hint: redoTarget.kind === "ready" ? "no credits" : undefined,
          disabled: redoTarget.kind !== "ready" || busy || timeTravelling,
          disabledReason:
            busy || timeTravelling ? "busy" : redoTarget.kind === "ready" ? "" : redoTarget.reason,
          run: () => void redo(),
        },
      ],
    },
    {
      heading: "Selection",
      commands: [
        {
          id: "select-element",
          label: selectMode ? "Stop selecting elements" : "Select an element in the preview",
          keywords: "click pick target element choose point",
          disabled: !previewReady,
          disabledReason: "preview still loading",
          run: () => {
            showView("preview");
            toggleSelectMode();
          },
        },
        {
          id: "selection-to-prompt",
          label: "Describe a change to the selected element",
          keywords: "prompt reference target edit change",
          disabled: selection === null,
          disabledReason: "nothing selected",
          run: insertSelectionReference,
        },
        {
          id: "selection-clear",
          label: "Clear the selection",
          keywords: "deselect reset none",
          disabled: selection === null,
          disabledReason: "nothing selected",
          run: clearSelection,
        },
      ],
    },
    {
      heading: "Preview width",
      commands: DEVICES.map((d) => ({
        id: `device-${d.id}`,
        label: d.label,
        keywords: `responsive width preview ${d.note}`,
        hint: d.note,
        run: () => {
          showView("preview");
          setDevice(d.id);
        },
      })),
    },
    {
      heading: "Site",
      commands: [
        {
          id: "publish",
          label: published ? "Republish site" : "Publish site",
          keywords: "deploy live go public",
          disabled: isFirstBuild || publishing,
          disabledReason: publishing ? "publishing…" : "after first build",
          run: () => void publish(),
        },
        {
          id: "open-draft",
          label: "Open this draft in a new tab",
          keywords: "preview full screen window tab",
          run: () =>
            window.open(`/projects/${props.projectId}/preview`, "_blank", "noopener"),
        },
        {
          id: "open-live",
          label: "Open the published site",
          keywords: "live url visit",
          disabled: liveHref === null,
          disabledReason: "not published",
          run: () => {
            if (liveHref) window.open(liveHref, "_blank", "noopener");
          },
        },
        {
          id: "download",
          label: "Download .zip",
          keywords: "export archive save files",
          disabled: downloading,
          disabledReason: "preparing…",
          run: () => void downloadZip(),
        },
        {
          id: "submissions",
          label:
            props.unreadSubmissions > 0
              ? `Form submissions (${props.unreadSubmissions} unread)`
              : "Form submissions",
          keywords: "contact form inbox messages leads enquiries",
          run: () => router.push(`/projects/${props.projectId}/submissions`),
        },
        {
          id: "records",
          label: "Site records",
          keywords: "data bookings listings crm storage records",
          run: () => router.push(`/projects/${props.projectId}/records`),
        },
        {
          id: "settings",
          label: "Settings",
          keywords: "spend cap account billing preferences",
          run: () => router.push("/settings"),
        },
      ],
    },
  ];

  const buildsLeft = Math.floor(balance / Math.max(props.avgBuildCredits, 1));
  const creditTone = balance <= 0 ? "danger" : buildsLeft < 2 ? "warn" : "neutral";

  const mainPanel = (
    <>
      {diffBuild !== null ? (
        <div className="h-full overflow-y-auto bg-canvas">
          {diffLoading ? (
            <p className="p-6 text-sm text-ink-3">Loading changes…</p>
          ) : diffError ? (
            <div className="p-6">
              <p className="text-sm text-danger">{diffError}</p>
              <Button size="sm" className="mt-3" onClick={() => setDiffBuild(null)}>
                Back
              </Button>
            </div>
          ) : diff ? (
            <DiffView
              diff={diff}
              // "Undo this build" is only an honest offer when this build is
              // where the draft actually is and there is a checkpoint directly
              // behind it. Anywhere else the same click would discard more than
              // the build being shown, so it is withheld with the reason rather
              // than quietly redefined.
              onUndo={
                diff.build.id === cursor &&
                undoTarget.kind === "ready" &&
                !undoTarget.offCheckpoint
                  ? () => void undo()
                  : null
              }
              undoUnavailable={
                diff.build.id !== cursor
                  ? "The draft is not at this build, so undoing it here would step over other changes. Use History to restore a specific checkpoint."
                  : undoTarget.kind === "unavailable"
                    ? `Can't undo: ${undoTarget.reason}.`
                    : "The draft has changed since this build, so the next step back is the build itself, not the one before it."
              }
              undoing={timeTravelling}
              onClose={() => setDiffBuild(null)}
            />
          ) : null}
        </div>
      ) : view === "preview" ? (
        // The FIRST build gets a full overlay because there is genuinely
        // nothing underneath; every later build veils the real site instead,
        // inside PreviewFrame. Two different truths, two different treatments.
        busy && run && isFirstBuildRun(run, messages) ? (
          <BuildingOverlay run={run} />
        ) : (
          <PreviewFrame
            doc={previewDoc}
            loading={previewLoading}
            error={previewError}
            reloadKey={previewNonce}
            device={device}
            onDeviceChange={setDevice}
            frameRef={frameRef}
            selectMode={selectMode}
            selectAvailable={previewReady}
            onToggleSelectMode={toggleSelectMode}
            onRefresh={() => setPreviewNonce((n) => n + 1)}
            open={{
              draftHref: `/projects/${props.projectId}/preview`,
              liveHref,
            }}
            host={siteHost}
            published={published}
            pageCount={pageCount}
            missing={previewMissing}
            busy={busy}
            run={run}
            emptyAction={
              <Button size="sm" onClick={focusPrompt}>
                Describe your site
              </Button>
            }
          />
        )
      ) : view === "code" ? (
        <CodePanel
          files={files}
          activeFile={activeFile}
          onSelect={setActiveFile}
          onDownload={() => void downloadZip()}
          downloading={downloading}
        />
      ) : view === "history" ? (
        <HistoryPanel
          builds={builds}
          cursor={cursor}
          dirty={dirty}
          restoring={restoring}
          busy={busy || timeTravelling}
          onOpenDiff={(id) => void openDiff(id)}
          onRestore={setConfirmRestore}
        />
      ) : view === "seo" ? (
        <SeoPanel
          projectId={props.projectId}
          projectName={props.projectName}
          published={published}
          liveUrl={liveHref}
          html={files["index.html"]}
          // Not refreshFiles: an SEO save writes draft files outside any build,
          // so the undo cursor has to learn the draft no longer matches its
          // checkpoint. See onManualSave.
          onSaved={onManualSave}
          slug={slug}
          sitesBase={SITES_BASE}
          onSlugChanged={setSlug}
        />
      ) : (
        // onSaved is not optional: a brand save rewrites src/index.css and
        // src/components/BrandLogo.tsx, both of which the Code view may be
        // showing right now.
        <div className="h-full overflow-y-auto bg-canvas">
          <BrandKitPanel
            projectId={props.projectId}
            projectName={props.projectName}
            onSaved={onManualSave}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {paletteOpen && <CommandPalette onClose={closePalette} groups={commandGroups} />}

      <ConfirmModal
        open={confirmRestore !== null}
        onClose={() => setConfirmRestore(null)}
        onConfirm={() => {
          if (confirmRestore) void restore(confirmRestore);
        }}
        title="Restore this checkpoint?"
        confirmLabel="Restore it"
        busy={restoring !== null}
        body={
          <>
            <p>
              Your current draft will be replaced by the version from “{confirmRestore?.prompt}”.
            </p>
            <p className="mt-2 text-ink-3">
              Restoring is free, and you can step forward again with Redo. It does not refund the
              credits any build cost, and your published site is untouched until you republish.
            </p>
          </>
        }
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hair bg-surface px-2 sm:px-3">
        {/* The builder sits outside the portal shell, so it carries its own way
            back. An icon plus a real accessible name, not a bare arrow. */}
        <ButtonLink
          href="/dashboard"
          size="sm"
          variant="ghost"
          aria-label="Back to your dashboard"
          icon={
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5 8 12l7 7" />
            </svg>
          }
          className="!px-2"
        >
          <span className="hidden sm:inline">Sites</span>
        </ButtonLink>

        <span className="hidden shrink-0 sm:block">
          <Mark size={20} />
        </span>

        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{props.projectName}</p>
          {/* The site-status channel, and the only place Publishing is a state
              rather than a spinner. Publish is a single request with no stream
              and no steps, so it gets a pulsing badge and the button's own
              busy state — not an AIProgress list it could not honestly fill. */}
          <Badge
            tone={publishing ? "info" : published ? "ok" : "neutral"}
            dot
            pulse={publishing}
            className="hidden shrink-0 sm:inline-flex"
          >
            {publishing ? "Publishing…" : published ? "Published" : "Draft"}
          </Badge>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            ref={paletteTriggerRef}
            type="button"
            onClick={(e) => openPalette(e.currentTarget)}
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
            aria-keyshortcuts="Meta+K Control+K"
            className="k-focus hidden items-center gap-1.5 rounded-md border border-hair px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink xl:flex"
          >
            Commands
            <kbd className="k-num rounded-xs border border-hair px-1 font-sans text-[10px] text-ink-3">
              {modKey}K
            </kbd>
          </button>

          <Segmented
            name="kodely-view"
            ariaLabel="Editor panel"
            size="sm"
            value={view}
            onChange={(v) => (v === "code" ? showCode() : v === "history" ? void openHistory() : showView(v))}
            options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
            className="hidden lg:inline-flex"
          />

          {/* Below lg the segmented control does not fit, so the same five
              panels live behind one button that names the current one. */}
          <Menu
            className="lg:hidden"
            align="end"
            trigger={(p) => (
              <button
                {...p}
                type="button"
                className="k-focus inline-flex h-8 items-center gap-1 rounded-md border border-hair px-2 text-[0.75rem] font-medium text-ink"
              >
                {VIEWS.find((v) => v.id === view)?.label}
                <svg viewBox="0 0 24 24" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
            items={VIEWS.map((v) => ({
              kind: "item" as const,
              label: v.label,
              onSelect: () =>
                v.id === "code" ? showCode() : v.id === "history" ? void openHistory() : showView(v.id),
              unavailableReason:
                isFirstBuild && (v.id === "code" || v.id === "history")
                  ? "after first build"
                  : undefined,
            }))}
          />

          {/* Warn BEFORE the dead end, not at it. Fewer than two builds' worth
              left turns this amber and offers the top-up inline, so nobody
              discovers the problem halfway through a generation. */}
          <Link
            href="/pricing"
            className="k-focus hidden rounded-full sm:inline-flex"
            aria-label={`${balance} credits remaining. Top up.`}
          >
            <Badge tone={creditTone} dot={creditTone !== "neutral"}>
              <span className="k-num">{balance}</span> credits
              {balance <= 0 ? " · top up" : buildsLeft < 2 ? " · running low" : ""}
            </Badge>
          </Link>

          <Menu
            align="end"
            trigger={(p) => (
              <button
                {...p}
                type="button"
                aria-label="More project actions"
                className="k-focus inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
            )}
            items={[
              {
                kind: "item",
                label: "Open this draft in a new tab",
                onSelect: () =>
                  window.open(`/projects/${props.projectId}/preview`, "_blank", "noopener"),
              },
              {
                kind: "item",
                label: "Open the published site",
                onSelect: () => {
                  if (liveHref) window.open(liveHref, "_blank", "noopener");
                },
                unavailableReason: liveHref ? undefined : "not published",
              },
              { kind: "separator" },
              {
                kind: "item",
                label: "Download .zip",
                onSelect: () => void downloadZip(),
                disabled: downloading,
              },
              {
                kind: "item",
                label:
                  props.unreadSubmissions > 0
                    ? `Form submissions (${props.unreadSubmissions})`
                    : "Form submissions",
                href: `/projects/${props.projectId}/submissions`,
              },
              {
                kind: "item",
                label: "Site records",
                href: `/projects/${props.projectId}/records`,
              },
              { kind: "separator" },
              { kind: "item", label: "Credits & billing", href: "/pricing" },
              { kind: "item", label: "Settings", href: "/settings" },
              {
                kind: "item",
                label: `Commands (${modKey}K)`,
                onSelect: () => openPalette(paletteTriggerRef.current),
              },
            ]}
          />

          {/* Secondary, deliberately. The one gradient in this view belongs to
              the send button — the customer's repeated action here is asking
              for a change, and publishing is the occasional punctuation. */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void publish()}
            loading={publishing}
            disabled={isFirstBuild}
            title={isFirstBuild ? "Build something first" : undefined}
          >
            {published ? "Republish" : "Publish"}
          </Button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────
          One grid, two shapes, and exactly ONE composer in the DOM.

          MOBILE. Chat and preview cannot share a phone screen, so the middle
          row swaps between them — but the COMPOSER is pinned below the swap in
          its own row and is present on both. That is the whole decision: the
          loop here is "type a change, watch it happen, type another", and a
          bottom sheet would cover the very thing you are inspecting while a
          plain tab swap would make you switch tabs to type. With the composer
          persistent you can sit on Preview, type, and watch your own site blur
          and come back — which is the product — or sit on Chat and read the
          steps. Nothing auto-switches: being yanked to another tab mid-read is
          worse than a dot on a tab label, which is what the Preview tab gets
          while a build is running.

          DESKTOP. Two columns: the chat log above the composer on the left,
          the panel spanning both rows on the right. Same single composer,
          moved by the grid rather than by rendering a second one — two
          instances would mean two elements with id="kodely-prompt" and an
          aria-describedby that resolves to whichever is first. */}
      <div
        className={[
          "grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto]",
          "lg:grid-cols-[minmax(360px,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]",
        ].join(" ")}
      >
        {/* Mobile tab bar */}
        <div className="col-start-1 row-start-1 flex items-center justify-between gap-2 border-b border-hair bg-surface px-3 py-2 lg:hidden">
          <Segmented
            name="kodely-mobile-tab"
            ariaLabel="Chat or preview"
            size="sm"
            value={mobileTab}
            onChange={setMobileTab}
            // The busy marker is WORDS, not a bullet glyph. `Segmented` uses
            // the label as the radio's accessible name, so "Preview ●" was
            // read out as "Preview black circle" — the one channel that was
            // supposed to carry the state carried noise instead.
            options={[
              { value: "chat", label: "Chat" },
              { value: "preview", label: busy ? "Preview · building" : "Preview" },
            ]}
          />
          <AssistantStatus state={assistantState} />
        </div>

        <div
          className={[
            "col-start-1 row-start-2 min-h-0 lg:col-start-1 lg:row-start-1 lg:border-r lg:border-hair",
            mobileTab === "chat" ? "flex flex-col" : "hidden lg:flex lg:flex-col",
          ].join(" ")}
        >
          <ChatLog
            state={assistantState}
            messages={messages}
            streamingReply={streamed}
            run={run}
            applied={applied}
            onOpenDiff={(id) => void openDiff(id)}
            onRegenerate={regenerateBuild && !busy && !timeTravelling ? () => void regenerate() : null}
            regenerateReason={regenerateReason}
            error={error}
            onRetry={retryable && !busy ? retry : null}
            errorWroteFiles={wroteFiles}
            // Did /api/generate answer 200 for the build that failed? Read
            // straight off the run, whose `accepted` field exists for exactly
            // this question and survives here because a FAILED run is kept (see
            // the finally block). It decides whether the copy may say anything
            // at all about what did or didn't happen server-side.
            errorAccepted={run?.accepted === true}
            // Dismissing clears the frozen step list too. The list and the
            // strip are two halves of one failure report — leaving the steps
            // behind would cap the conversation with a dead list the customer
            // has already said they are done with.
            onDismissError={() => {
              setError(null);
              setRetryable(false);
              setRun(null);
            }}
            interruption={
              interruption && (
                <BuildInterrupted
                  kind={interruption}
                  wroteFiles={wroteFiles}
                  onDismiss={() => {
                    setInterruption(null);
                    setRun(null);
                  }}
                />
              )
            }
            suggestions={suggestions}
            onUseSuggestion={useSuggestion}
            isFirstBuild={isFirstBuild}
          />
        </div>

        <div
          className={[
            "col-start-1 row-start-2 min-h-0 lg:col-start-2 lg:row-span-2 lg:row-start-1",
            mobileTab === "preview" ? "block" : "hidden lg:block",
          ].join(" ")}
        >
          {mainPanel}
        </div>

        <div className="col-start-1 row-start-3 lg:col-start-1 lg:row-start-2 lg:border-r lg:border-hair">
          <Composer
            value={prompt}
            onChange={setPrompt}
            promptRef={promptRef}
            onSubmit={() => void send()}
            onStop={stop}
            busy={busy}
            stopping={stopping}
            isFirstBuild={isFirstBuild}
            balance={balance}
            estimate={isFirstBuild ? props.estimates.create : props.estimates.edit}
            avgBuildCredits={props.avgBuildCredits}
            measuredBuilds={props.measuredBuilds}
            image={image}
            onImageChange={setImage}
            enhancing={enhancing}
            onEnhance={() => void enhance()}
            enhancedFrom={enhancedFrom}
            onRevertEnhance={revert}
            before={
              <>
                {/* One-step undo, so "that last change was wrong" does not mean
                    opening History and picking the right row. Rendered only
                    once a checkpoint exists. The hint spells out the target,
                    because Undo REPLACES THE DRAFT and a control that does that
                    silently is not one anybody should trust. */}
                {builds.length > 0 && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <IconButton
                      label={
                        undoTarget.kind === "ready"
                          ? undoTarget.offCheckpoint
                            ? `Undo: restore the last build, ${undoTarget.build.prompt}`
                            : `Undo the build ${undoTarget.build.prompt}`
                          : `Undo unavailable: ${undoTarget.reason}`
                      }
                      size="xs"
                      className="border border-hair"
                      onClick={() => void undo()}
                      disabled={undoTarget.kind !== "ready" || busy || timeTravelling}
                    >
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 7 4 12l5 5" />
                        <path d="M4 12h10a6 6 0 0 1 0 12h-1" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label={
                        redoTarget.kind === "ready"
                          ? `Redo the build ${redoTarget.build.prompt}`
                          : `Redo unavailable: ${redoTarget.reason}`
                      }
                      size="xs"
                      className="border border-hair"
                      onClick={() => void redo()}
                      disabled={redoTarget.kind !== "ready" || busy || timeTravelling}
                    >
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 7 5 5-5 5" />
                        <path d="M20 12H10a6 6 0 0 0 0 12h1" />
                      </svg>
                    </IconButton>
                    {/* Not aria-live. The editor has exactly one live region
                        (the build progress list) and a second one announcing
                        every label change would talk over it. The buttons carry
                        the same information in their accessible names. */}
                    <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-ink-3">
                      {timeTravelling ? "Working…" : undoHint}
                    </span>
                  </div>
                )}
                <SelectionPanel
                  selection={selection}
                  selectMode={selectMode}
                  ready={previewReady}
                  onMove={moveSelection}
                  onClear={clearSelection}
                  onUseInPrompt={insertSelectionReference}
                />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}

/** The overlay-vs-veil choice. `run.kind` is fixed when the build starts, so
    it is the only thing that still knows whether there was a site here before
    this build began — `messages` has already grown by then. */
function isFirstBuildRun(run: BuildRun, messages: Message[]): boolean {
  return run.kind === "create" && messages.filter((m) => m.role === "assistant").length === 0;
}

/**
 * The step machine behind the build-start experience.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AS A PURE REDUCER
 * ─────────────────────────────────────────────────────────────────────────────
 * `AIProgress` is only honest if every step change is caused by something that
 * actually happened. Keeping the mapping here — with no timers, no `setTimeout`
 * and no access to the clock — makes that structurally true rather than a
 * promise in a comment: this module CANNOT advance a step on its own, because
 * the only way to move it is to hand it a signal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REAL SSE VOCABULARY OF /api/generate  (audited 2026-08-22)
 * ─────────────────────────────────────────────────────────────────────────────
 * `app/api/generate/route.ts` writes `data: <json>\n\n` frames. Exactly six
 * event shapes ever reach the client:
 *
 *   { type: "text",     text }                 assistant prose deltas
 *   { type: "progress", text }                 one narrated tool call
 *   { type: "status",   text }                 a phase the server names itself
 *   { type: "file",     path, action }         a source file was written/deleted
 *   { type: "done",     credits, remaining, filesWritten, buildId,
 *                       repairAttempts, repairWaived, waivedCredits }
 *   { type: "error",    message }
 *
 * A seventh, `{ type: "usage", … }`, is produced by the agent but consumed
 * server-side for billing and is NEVER forwarded — so the client cannot see
 * token spend while a build runs.
 *
 * The two text channels are NOT free-form. Their producers are enumerable:
 *
 *   `progress` — `narrateTool()` in lib/build-narration.ts, one line per real
 *     tool call, with consecutive duplicates collapsed by the route:
 *       "Writing <thing>" / "Writing a file"      (Write, write_file)
 *       "Updating <thing>" / "Making an edit"     (Edit)
 *       "Removing <thing>" / "Removing a file"    (delete_file)
 *       "Looking through the project"             (Read, Glob, Grep)
 *       "Running a command"                       (Bash)
 *     plus two the route/agent emit directly:
 *       "Picking out icons and artwork"           (lib/agent.ts asset tool)
 *       "Compiling the site"                      (route, before buildSite())
 *
 *   `status` — only two producers:
 *       "Building your site…" / "Applying your changes…"  (SDK engine, once)
 *       "Build didn't compile — fixing it…"               (route, per repair)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THAT VOCABULARY CAN AND CANNOT SUPPORT
 * ─────────────────────────────────────────────────────────────────────────────
 * The brief asked for six steps: understanding, planning, designing,
 * generating, content, finalizing. Four of those six are NOT observable. The
 * stream carries no "planning" marker, no "designing" marker and no way to
 * separate layout work from copy work — a write to `src/components/Hero.tsx`
 * is one `file` event whether the model was laying out a grid or writing the
 * headline. Rendering all six would mean inventing four of them, and a step
 * that lights up because 4 seconds elapsed is exactly the fake this redesign
 * exists to remove.
 *
 * So there are FIVE steps, and each one is entered or completed by a specific
 * observable fact:
 *
 *   0 project    done when POST /api/projects returns a project id
 *   1 sending    done when POST /api/generate answers 200 with a body — which
 *                means credits, spend cap, rate limit and the kill switch all
 *                passed and a Build row exists
 *   2 thinking   done at the first evidence of a WRITE (a `file` event, or a
 *                `progress` line from the Write/Edit/delete_file branch)
 *   3 writing    done when the route sends `progress: "Compiling the site"`
 *   4 compiling  done on `done`
 *
 * And the list can move BACKWARD: `status: "Build didn't compile — fixing it…"`
 * returns the active step to `writing`, because that is what the server just
 * did. An `error` freezes the list and marks the step it died on as failed.
 */

/** The literal the route sends immediately before `buildSite()`. */
const COMPILING_LINE = "Compiling the site";

/** The literal the route sends before a repair pass. Matched on the stable
    leading clause rather than the whole string, so the trailing wording can
    change without silently breaking the mapping. */
const REPAIR_PREFIX = /^Build didn't compile/;

/** Every `narrateTool` branch that means a file was touched. `Making an edit`
    is the Edit branch when the tool call carried no readable path. */
const WRITE_LINE = /^(Writing|Updating|Removing|Making an edit)\b/;

export const BUILD_STEPS = [
  { id: "project", label: "Creating your project" },
  { id: "sending", label: "Sending your brief to Kodely" },
  { id: "thinking", label: "Reading the brief and the starter files" },
  { id: "writing", label: "Writing your site's files" },
  { id: "compiling", label: "Compiling the site" },
] as const;

const STEP = {
  project: 0,
  sending: 1,
  thinking: 2,
  writing: 3,
  compiling: 4,
} as const;

/** One frame off the wire, after narrowing. */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "status"; text: string }
  | { type: "file"; path: string; action: string }
  | {
      type: "done";
      credits: number;
      remaining: number;
      filesWritten: number;
      buildId: string | null;
      repairAttempts: number;
      repairWaived: boolean;
      waivedCredits: number;
    }
  | { type: "error"; message: string };

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Narrow one parsed SSE payload. Returns null for anything unrecognised —
 * a frame we cannot read must not move the step list, and must not throw and
 * kill a build that is otherwise going fine.
 */
export function parseStreamEvent(raw: unknown): StreamEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "text":
      return { type: "text", text: str(e.text) };
    case "progress":
      return { type: "progress", text: str(e.text) };
    case "status":
      return { type: "status", text: str(e.text) };
    case "file":
      return { type: "file", path: str(e.path), action: str(e.action) };
    case "done":
      return {
        type: "done",
        credits: num(e.credits),
        remaining: num(e.remaining),
        filesWritten: num(e.filesWritten),
        buildId: typeof e.buildId === "string" ? e.buildId : null,
        repairAttempts: num(e.repairAttempts),
        repairWaived: e.repairWaived === true,
        waivedCredits: num(e.waivedCredits),
      };
    case "error":
      return { type: "error", message: str(e.message, "The build failed.") };
    default:
      return null;
  }
}

export type BuildOutcome = "running" | "succeeded" | "failed";

export type BuildProgress = {
  /** Index into BUILD_STEPS of the step currently in flight. */
  index: number;
  outcome: BuildOutcome;
  /** The most recent `progress`/`status` line, verbatim. The raw signal. */
  line: string | null;
  /** `file` events seen. On the SDK engine these can arrive in one batch. */
  filesTouched: number;
  /** Repair passes the SERVER announced. Never inferred. */
  repairs: number;
  buildId: string | null;
  credits: number | null;
  remaining: number | null;
  error: string | null;
  /** True once any byte of the stream has been read. Distinguishes "refused
      before it started" (safe to retry on the same project) from "died
      mid-build" (a user message row already exists, so a retry would be an
      edit rather than a first build). */
  streamStarted: boolean;
};

export const INITIAL_BUILD: BuildProgress = {
  index: STEP.project,
  outcome: "running",
  line: null,
  filesTouched: 0,
  repairs: 0,
  buildId: null,
  credits: null,
  remaining: null,
  error: null,
  streamStarted: false,
};

export type BuildSignal =
  /** POST /api/projects resolved with an id. */
  | { kind: "project-created" }
  /** POST /api/generate answered 200 and handed back a readable body. */
  | { kind: "accepted" }
  /** One frame off the stream. */
  | { kind: "sse"; event: StreamEvent }
  /** The request was refused, or the fetch itself threw. */
  | { kind: "failed"; message: string }
  /** The stream closed without a `done` or an `error`. */
  | { kind: "lost" }
  /** The customer pressed Stop. */
  | { kind: "stopped" };

const LOST_MESSAGE =
  "The connection to the build dropped before it finished. Nothing was charged — open the project to see what was written and try again there.";

const STOPPED_MESSAGE =
  "You stopped the build. Nothing was charged. Any files written before you stopped are already in the project.";

/** Pure. The ONLY way BuildProgress changes. */
export function reduceBuild(state: BuildProgress, signal: BuildSignal): BuildProgress {
  if (state.outcome !== "running") return state;

  switch (signal.kind) {
    case "project-created":
      return { ...state, index: Math.max(state.index, STEP.sending) };

    case "accepted":
      return { ...state, index: Math.max(state.index, STEP.thinking) };

    case "failed":
      return { ...state, outcome: "failed", error: signal.message };

    case "lost":
      return { ...state, outcome: "failed", error: LOST_MESSAGE };

    case "stopped":
      return { ...state, outcome: "failed", error: STOPPED_MESSAGE };

    case "sse":
      return applyEvent({ ...state, streamStarted: true }, signal.event);
  }
}

function applyEvent(state: BuildProgress, event: StreamEvent): BuildProgress {
  switch (event.type) {
    // Prose from the model. Real evidence the request is being worked on, but
    // it names no phase, so it moves nothing beyond "the stream is alive".
    case "text":
      return state;

    case "progress":
    case "status": {
      const text = event.text;
      const next = { ...state, line: text || state.line };

      // The server just told us the previous attempt did not compile. Going
      // back to `writing` is not a glitch — the build genuinely went back.
      if (REPAIR_PREFIX.test(text)) {
        return { ...next, index: STEP.writing, repairs: next.repairs + 1 };
      }
      if (text === COMPILING_LINE) {
        return { ...next, index: STEP.compiling };
      }
      if (WRITE_LINE.test(text)) {
        return { ...next, index: Math.max(next.index, STEP.writing) };
      }
      // "Looking through the project", "Running a command", "Picking out icons
      // and artwork", "Building your site…" — all real, none of them a phase
      // change. They show up in the live line and nowhere else.
      return { ...next, index: Math.max(next.index, STEP.thinking) };
    }

    case "file":
      return {
        ...state,
        filesTouched: state.filesTouched + 1,
        index: Math.max(state.index, STEP.writing),
      };

    case "done":
      return {
        ...state,
        outcome: "succeeded",
        index: BUILD_STEPS.length,
        line: null,
        buildId: event.buildId,
        credits: event.credits,
        remaining: event.remaining,
        // The server's own count is authoritative over the events we happened
        // to see — a dropped frame must not understate what was written.
        filesTouched: Math.max(state.filesTouched, event.filesWritten),
        repairs: Math.max(state.repairs, event.repairAttempts),
      };

    case "error":
      return { ...state, outcome: "failed", error: event.message };
  }
}

/**
 * The step machine behind the builder's progress display.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A PURE REDUCER
 * ─────────────────────────────────────────────────────────────────────────────
 * `AIProgress` is only honest if every step change is caused by something that
 * actually happened. Keeping the mapping here — with no timers, no setTimeout
 * and no access to the clock — makes that structurally true rather than a
 * promise in a comment: this module CANNOT advance a step on its own, because
 * the only way to move it is to hand it a signal.
 *
 * The chat panel's step list, the initial-build overlay and the veil over the
 * preview all render from one `BuildRun`, so the three of them cannot disagree
 * about what is happening.
 *
 * This is deliberately the same shape as the reducer behind the create flow
 * (app/(portal)/dashboard/new/build-steps.ts). The two surfaces show a customer
 * the same product and must not narrate a build in two different vocabularies.
 * The step LABELS differ, because an edit is not a create and "Writing your
 * site's files" is the wrong sentence for someone who asked to change a button.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REAL SSE VOCABULARY OF /api/generate  (audited against route.ts,
 * lib/agent.ts, lib/agent-sdk.ts and lib/build-narration.ts)
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
 * A seventh, { type: "usage", … }, is produced by the agent and consumed
 * SERVER-SIDE for billing. It is never forwarded, so the client cannot show a
 * live spend readout during a build and nothing here pretends it can. The
 * charge is known once, on `done`.
 *
 * The two text channels are not free-form. Their producers are enumerable:
 *
 *   `progress` — narrateTool() in lib/build-narration.ts, one line per real
 *     tool call, with consecutive duplicates collapsed by the route:
 *       "Writing <thing>" / "Writing a file"      (Write, write_file)
 *       "Updating <thing>" / "Making an edit"     (Edit)
 *       "Removing <thing>" / "Removing a file"    (delete_file)
 *       "Looking through the project"             (Read, Glob, Grep — sdk)
 *       "Running a command"                       (Bash — sdk)
 *     plus two emitted directly:
 *       "Picking out icons and artwork"           (lib/agent.ts, find_assets)
 *       "Compiling the site"                      (route, before buildSite();
 *                                                  bypasses the dedupe)
 *
 *   `status` — only two producers:
 *       "Building your site…" / "Applying your changes…"  (sdk engine, once)
 *       "Build didn't compile — fixing it…"               (route, per repair;
 *                                                          MAX_BUILD_ATTEMPTS
 *                                                          is 2, so at most one)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THAT VOCABULARY CAN AND CANNOT SUPPORT
 * ─────────────────────────────────────────────────────────────────────────────
 * There is no "planning" marker and no "designing" marker, and nothing can
 * separate layout work from copy work — a write to src/components/Hero.tsx is
 * one `file` event whether the model was laying out a grid or writing the
 * headline. A longer list would mean inventing the extra entries, and a step
 * that lights up because four seconds elapsed is exactly the fake this exists
 * to remove. So: FOUR steps, each entered or completed by a specific
 * observable fact.
 *
 *   0 sending    done when POST /api/generate answers 200 with a body — which
 *                means the kill switch, the balance, the spend cap and the
 *                rate limit all passed and a Build row exists
 *   1 thinking   done at the first evidence of a WRITE (a `file` event, or a
 *                narrateTool line from the Write/Edit/delete branch)
 *   2 writing    done when the route sends progress "Compiling the site"
 *   3 compiling  done on `done`
 *
 * The list can move BACKWARD. `status: "Build didn't compile — fixing it…"`
 * returns the active step to `writing` and increments a real counter, because
 * that is what the server just did — the files are being changed again. An
 * `error` freezes the list and marks the step it died on as failed. A stream
 * that closes with neither `done` nor `error` is a dropped connection and is
 * never reported as a finish.
 */

import { stepsAt, type ProgressStep } from "@/components/ui/AIProgress";

/** The literal the route sends immediately before buildSite(). */
const COMPILING_LINE = "Compiling the site";

/** The literal the route sends before a repair pass. Matched on the stable
    leading clause rather than the whole string, so trailing wording can change
    without silently breaking the mapping — and if it ever stops matching, the
    list simply shows one fewer true transition rather than a wrong one. */
const REPAIR_PREFIX = /^Build didn['’]t compile/;

/** Every narrateTool branch that means a file was touched. "Making an edit" is
    the Edit branch when the tool call carried no readable path. */
const WRITE_LINE = /^(Writing|Updating|Removing|Making an edit)\b/;

const STEP = { sending: 0, thinking: 1, writing: 2, compiling: 3 } as const;

/** Wording per build kind. The create column is deliberately the same as the
    create flow's, so someone who started a site on /dashboard/new and then
    edits it here is not told the same work in two different voices. */
const LABELS: Record<"create" | "edit", { id: string; label: string }[]> = {
  create: [
    { id: "sending", label: "Sending your brief to Kodely" },
    { id: "thinking", label: "Reading the brief and the starter files" },
    { id: "writing", label: "Writing your site’s files" },
    { id: "compiling", label: "Compiling the site" },
  ],
  edit: [
    { id: "sending", label: "Sending your change" },
    { id: "thinking", label: "Reading your site and working out the change" },
    { id: "writing", label: "Editing the files" },
    { id: "compiling", label: "Compiling the site" },
  ],
};

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
 * Narrow one parsed SSE payload. Returns null for anything unrecognised — a
 * frame we cannot read must not move the step list, and must not throw and
 * kill a build that is otherwise going fine. The route adds fields to `done`
 * over time and explicitly expects the client to ignore what it does not know.
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

export type BuildRun = {
  /** Fixed when the build starts. `isFirstBuild` flips the moment the user's
      message joins the list, so a running build must not relabel itself. */
  kind: "create" | "edit";
  index: number;
  outcome: BuildOutcome;
  /** The most recent progress/status line, VERBATIM. lib/build-narration.ts is
      the intended source of this text and is already written for a
      non-developer, so it is shown as-is and never paraphrased. */
  line: string | null;
  /** `file` events seen. On the sdk engine these can arrive in one batch after
      the build, so this is evidence a write happened — not a live count. */
  filesTouched: number;
  /** Repair passes the SERVER announced. Never inferred from a stall. */
  repairs: number;
  /**
   * The request was answered 200 with a readable body. That is the line
   * between "refused before anything happened" and "the server started work":
   * route.ts writes the Build row AND the user's Message row before it returns
   * the stream, so past this point a retry is a follow-up edit rather than a
   * clean re-run. Nothing else can tell those two apart.
   */
  accepted: boolean;
};

export function startRun(kind: "create" | "edit"): BuildRun {
  return {
    kind,
    index: STEP.sending,
    outcome: "running",
    line: null,
    filesTouched: 0,
    repairs: 0,
    accepted: false,
  };
}

export type BuildSignal =
  /** POST /api/generate answered 200 and handed back a readable body. */
  | { kind: "accepted" }
  /** One frame off the stream. */
  | { kind: "sse"; event: StreamEvent }
  /** The request was refused, the fetch threw, or the stream ended without a
      terminal event. The step list stops where it is, marked failed. */
  | { kind: "failed" };

/** Pure. The ONLY way a BuildRun changes. */
export function reduceBuild(run: BuildRun, signal: BuildSignal): BuildRun {
  if (run.outcome !== "running") return run;
  switch (signal.kind) {
    case "accepted":
      return { ...run, accepted: true, index: Math.max(run.index, STEP.thinking) };
    case "failed":
      return { ...run, outcome: "failed" };
    case "sse":
      return applyEvent(run, signal.event);
  }
}

function applyEvent(run: BuildRun, event: StreamEvent): BuildRun {
  switch (event.type) {
    // Prose from the model. Real evidence the request is being worked on, but
    // it names no phase, so it moves nothing.
    case "text":
      return run;

    case "progress":
    case "status": {
      const text = event.text;
      const next = { ...run, line: text || run.line };

      // The server just told us the previous attempt did not compile. Going
      // back to `writing` is not a glitch — the build genuinely went back.
      if (REPAIR_PREFIX.test(text)) {
        return { ...next, index: STEP.writing, repairs: next.repairs + 1 };
      }
      if (text === COMPILING_LINE) return { ...next, index: STEP.compiling };
      if (WRITE_LINE.test(text)) return { ...next, index: Math.max(next.index, STEP.writing) };
      // "Looking through the project", "Running a command", "Picking out icons
      // and artwork", "Applying your changes…" — all real, none of them a
      // phase change. They show up in the live line and nowhere else.
      return { ...next, index: Math.max(next.index, STEP.thinking) };
    }

    case "file":
      return {
        ...run,
        filesTouched: run.filesTouched + 1,
        index: Math.max(run.index, STEP.writing),
      };

    case "done":
      return {
        ...run,
        outcome: "succeeded",
        index: LABELS[run.kind].length,
        line: null,
        // The server's own counts are authoritative over the events we
        // happened to see — a dropped frame must not understate the work.
        filesTouched: Math.max(run.filesTouched, event.filesWritten),
        repairs: Math.max(run.repairs, event.repairAttempts),
      };

    case "error":
      return { ...run, outcome: "failed" };
  }
}

/**
 * The step list, ready for `AIProgress`.
 *
 * `live` swaps the active step's generic label for the real narration line
 * when there is one, so "Editing the files" becomes "Writing the hero section"
 * — the actual tool call, not a guess about it.
 */
export function buildSteps(run: BuildRun, { live = true }: { live?: boolean } = {}): ProgressStep[] {
  const labels = LABELS[run.kind];
  if (run.outcome === "succeeded") return stepsAt(labels, labels.length);
  const active = Math.min(run.index, labels.length - 1);
  if (run.outcome === "failed") return stepsAt(labels, active, true);
  const shown =
    live && run.line
      ? labels.map((l, i) => (i === active ? { ...l, label: run.line as string } : l))
      : labels;
  return stepsAt(shown, active);
}

/** One sentence for the places too small for the whole list — the veil's
    caption and the browser tab title. Always the truest thing we have. */
export function buildHeadline(run: BuildRun): string {
  if (run.outcome === "succeeded") return "Change applied";
  if (run.outcome === "failed") return "Build failed";
  if (run.line) return run.line;
  return buildSteps(run, { live: false }).find((s) => s.state === "active")?.label ?? "Working";
}

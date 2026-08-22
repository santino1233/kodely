"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Mark } from "@/components/marketing/Logo";
import { AIProgress } from "@/components/ui/AIProgress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import BuildRating from "./BuildRating";
import { buildSteps, type BuildRun } from "./build-steps";

// The conversation half of the builder. An assistant, not a log file: a named
// header with a real status, the turns so far, and — while a build runs — the
// same step list the preview is showing, driven by the same object.
//
// It owns exactly one aria-live region on this screen (AIProgress's). Nothing
// else here announces, which is why BuildingOverlay, BuildVeil, DiffView and
// SelectionPanel all stay silent: two regions carrying the same text made a
// screen reader read every progress line twice.

export type AssistantState = "ready" | "working" | "error";

export type Applied = {
  buildId: string;
  filesWritten: number;
  credits: number;
  /** Rule 4 of the anti-bill-shock contract: a compile repair is our mistake
      and our cost. The route sends both fields; showing them is the only way
      the customer learns the fixing part was free. */
  repairWaived: boolean;
  waivedCredits: number;
};

export type Suggestion = { id: string; label: string; prompt: string };

function Who({ children }: { children: ReactNode }) {
  return <p className="k-label mb-1.5">{children}</p>;
}

export function AssistantStatus({ state }: { state: AssistantState }) {
  if (state === "working") {
    return (
      <Badge tone="brand" dot pulse>
        Working
      </Badge>
    );
  }
  if (state === "error") {
    return (
      <Badge tone="danger" dot>
        Error
      </Badge>
    );
  }
  return (
    <Badge tone="ok" dot>
      Ready
    </Badge>
  );
}

export default function ChatLog({
  state,
  messages,
  streamingReply,
  run,
  applied,
  onOpenDiff,
  onRegenerate,
  regenerateReason,
  error,
  onRetry,
  errorWroteFiles,
  errorAccepted,
  onDismissError,
  interruption,
  suggestions,
  onUseSuggestion,
  isFirstBuild,
}: {
  state: AssistantState;
  messages: { role: string; content: string }[];
  /** The assistant's reply as it streams in. Dropped rather than kept if the
      build does not finish — the route only persists it in the success
      branch, so leaving it on screen would show a message a reload deletes. */
  streamingReply: string | null;
  run: BuildRun | null;
  /** The build that just finished IN THIS SESSION. Not restored on reload:
      rating and "see what changed" for a build you last saw yesterday is
      guesswork. */
  applied: Applied | null;
  onOpenDiff: (buildId: string) => void;
  /** Undo the last build and run its prompt again. Null when that would not
      be a truthful offer — see the reason beside it. */
  onRegenerate: (() => void) | null;
  regenerateReason: string;
  error: string | null;
  /** Null when a retry would not be a clean re-run. See the copy below: the
      difference is not cosmetic, it decides what the customer should do next. */
  onRetry: (() => void) | null;
  /** Whether the dead build had already written files. Only meaningful when
      `onRetry` is null — a build that was refused before it started cannot
      have written anything. */
  errorWroteFiles: boolean;
  /** Did /api/generate answer 200 for the build that failed? False means no
      usable response ever came back, so this tab knows NOTHING about what
      happened server-side and the copy must not pretend otherwise. */
  errorAccepted: boolean;
  onDismissError: () => void;
  interruption: ReactNode;
  suggestions: Suggestion[];
  onUseSuggestion: (s: Suggestion) => void;
  isFirstBuild: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // Stick to the bottom, but only while the reader is already there. Yanking
  // someone back down while they are re-reading an earlier turn is the single
  // most annoying thing a chat panel can do.
  const stuck = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stuck.current) end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamingReply, run, applied, error, interruption]);

  return (
    <div className="flex min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hair px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <Mark size={20} />
          <span className="k-h2 truncate text-ink">Kodely AI</span>
        </span>
        <AssistantStatus state={state} />
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="k-msg-in">
            <p className="text-sm leading-relaxed text-ink-2">
              Tell me what you want and I’ll build it — a real React site, live in a minute or
              two. The more specific you are about audience, purpose and tone, the closer the
              first version lands.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="k-msg-in">
              <Who>You</Who>
              <div className="rounded-lg rounded-tl-sm bg-surface-2 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="k-msg-in">
              <Who>Kodely</Who>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
                {m.content}
              </div>
            </div>
          ),
        )}

        {/* The reply as it arrives. The model is told to write the files first
            and finish with two or three sentences, so this usually lands at
            the very end of a build — but on the api engine it can also narrate
            between tool calls, and every one of those characters is part of
            what gets saved, so showing them live is showing the truth. */}
        {streamingReply != null && streamingReply.length > 0 && (
          <div className="k-msg-in">
            <Who>Kodely</Who>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
              {streamingReply}
            </div>
          </div>
        )}

        {/* Rendered while RUNNING and while FAILED, not just while running.
            A failed run freezes the list at the step it died on and marks that
            step with AIProgress's `failed` icon — which is the whole reason
            build-steps.ts threads the flag through stepsAt(). Gating on
            "running" alone made that state unreachable and threw away the one
            piece of information the customer most wants after a failure: how
            far it got.

            Which runs reach here as `failed` is Editor.tsx's decision, and it
            is narrower than "the reducer says failed": a stop and a dropped
            stream both clear `run` instead, because a ✕ on a step would claim
            a failure neither of them establishes. So a frozen list here always
            means the server reported an error. */}
        {run && run.outcome !== "succeeded" && (
          <div className="k-msg-in rounded-lg border border-hair bg-surface-2/60 p-3">
            <AIProgress steps={buildSteps(run)} />
          </div>
        )}

        {applied && (
          <div className="k-msg-in rounded-lg border border-hair bg-surface p-3 shadow-e1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok" dot>
                Applied
              </Badge>
              <span className="k-num text-[0.75rem] text-ink-2">
                {applied.filesWritten} file{applied.filesWritten === 1 ? "" : "s"} ·{" "}
                {applied.credits} credit{applied.credits === 1 ? "" : "s"}
              </span>
            </div>
            {applied.repairWaived && (
              // The customer watched "That didn't compile — fixing it" go past.
              // Without this the next thing they see is a charge and no
              // statement that the fixing part was on us.
              <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-2">
                The first compile failed and Kodely fixed it. That repair cost{" "}
                <span className="k-num">{applied.waivedCredits}</span> credits and you weren’t
                charged for it.
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Button size="xs" onClick={() => onOpenDiff(applied.buildId)}>
                See what changed
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onRegenerate?.()}
                disabled={onRegenerate === null}
                // Spelled out, because this control does two chargeable-adjacent
                // things: it undoes (free) and then builds again (not free).
                title={
                  onRegenerate
                    ? "Undo this build, then run the same prompt again. The new build is charged; undoing does not refund this one."
                    : regenerateReason
                }
              >
                Try again differently
              </Button>
            </div>
            {onRegenerate === null && (
              <p className="mt-1.5 text-[0.6875rem] text-ink-3">{regenerateReason}</p>
            )}
            <div className="mt-3 border-t border-hair pt-2.5">
              <BuildRating key={applied.buildId} buildId={applied.buildId} />
            </div>
          </div>
        )}

        {interruption}

        {error && (
          <div
            role="alert"
            className="k-msg-in rounded-lg border border-danger/30 bg-danger-tint p-3"
          >
            <p className="text-[0.8125rem] leading-relaxed text-danger">{error}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {onRetry && (
                <Button size="xs" onClick={onRetry}>
                  Try again
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={onDismissError}>
                Dismiss
              </Button>
            </div>
            {/* Three genuinely different failures, and the customer's next move
                differs for each — so they get different sentences rather than
                one softened one that fits none of them.

                onRetry PRESENT: route.ts refused before writing anything (kill
                switch, balance, spend cap, rate limit). No Build row, no
                Message row, no files touched. A retry really is a clean re-run.

                !errorAccepted: no 200 ever came back. We CANNOT say the request
                did not reach the server, so we cannot say nothing happened and
                we cannot say nothing was charged. The only honest instruction
                is the same one BuildInterrupted gives for a lost stream: go
                and look.

                errorAccepted: the build started and died. The user's Message
                row already exists, so resending is classified `edit` by the
                route (kind is derived from messages.length) — which is why no
                Try again is offered and why the copy below does not call a
                resend a fresh build. Whether FILES moved is the remaining
                question, and that is what errorWroteFiles answers. */}
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-2">
              {onRetry ? (
                // Verified in app/api/generate/route.ts: every failure path
                // writes creditsCharged: 0 and never touches the ledger.
                <>
                  The failed build cost you nothing. Trying again starts a new one, which is
                  charged normally.
                </>
              ) : !errorAccepted ? (
                <>
                  Kodely never answered, so this tab can&apos;t tell whether a build started on our
                  side. Reload to see where your project and credit balance actually stand before
                  sending this again.
                </>
              ) : errorWroteFiles ? (
                <>
                  Kodely had already changed some files before this stopped, so your site is
                  part-way through the edit. You weren&apos;t charged. Check the preview, then
                  either describe what to fix, or undo this build from History.
                </>
              ) : (
                <>
                  Nothing was written to your site and you weren&apos;t charged. Your message is
                  already in the conversation, so sending it again runs as a follow-up change
                  rather than a fresh start.
                </>
              )}
            </p>
          </div>
        )}

        {/* Follow-ups. Plain prompt text that lands in the box for editing —
            nothing here is generated, and nothing sends on its own. */}
        {suggestions.length > 0 && (
          <div className="k-msg-in">
            <p className="k-label mb-2">{isFirstBuild ? "Try one of these" : "Next, you could"}</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUseSuggestion(s)}
                  className="k-focus rounded-full border border-hair bg-surface px-2.5 py-1 text-left text-[0.75rem] text-ink-2 transition-colors duration-[var(--t-1)] hover:border-line-mid hover:bg-surface-2 hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={end} />
      </div>
    </div>
  );
}

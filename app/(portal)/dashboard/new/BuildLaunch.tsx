"use client";

import { AlertTriangle, Hammer } from "lucide-react";
import { AIProgress, stepsAt } from "@/components/ui/AIProgress";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { BUILD_STEPS, type BuildProgress } from "./build-steps";

/* The screen between "I pressed build" and "I am in the builder".
   ────────────────────────────────────────────────────────────────
   It runs the REAL build. It is not a loading screen played over a
   navigation: the SSE stream from /api/generate is open on this page, every
   step below is moved by an event off that stream, and the customer is only
   sent to /projects/<id> once the server has said `done`.

   That ordering is deliberate. Navigating mid-stream would close the response
   body, which fires `cancel()` on the route's ReadableStream, which aborts the
   model request — so "show progress here, then hand over" is the only version
   of this screen that does not silently kill the thing it is narrating. The
   copy says so rather than hoping nobody closes the tab. */
export function BuildLaunch({
  progress,
  prompt,
  projectId,
  stopping,
  onStop,
  onRetry,
  onEdit,
}: {
  progress: BuildProgress;
  prompt: string;
  projectId: string | null;
  stopping: boolean;
  onStop: () => void;
  /** Null when a retry from here would not be a first build any more. */
  onRetry: (() => void) | null;
  onEdit: () => void;
}) {
  const failed = progress.outcome === "failed";
  const succeeded = progress.outcome === "succeeded";
  const running = progress.outcome === "running";

  return (
    <div className="mx-auto w-full max-w-xl pt-6 sm:pt-14">
      <div className="k-msg-in relative overflow-hidden rounded-2xl border border-hair bg-surface p-5 shadow-e2 sm:p-7">
        <div className="k-wash" aria-hidden />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="k-h1 text-ink">
                {succeeded
                  ? "Your site is built"
                  : failed
                    ? "The build stopped"
                    : "Building your site"}
              </h1>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
                {succeeded
                  ? "Opening the builder so you can see it and keep changing it."
                  : failed
                    ? "Nothing further will happen until you choose what to do next."
                    : "Every line below moves when the build reports it, not on a timer."}
              </p>
            </div>
            {running && (
              <Badge tone="brand" dot pulse>
                Live
              </Badge>
            )}
            {succeeded && (
              <Badge tone="ok" dot>
                Done
              </Badge>
            )}
            {failed && (
              <Badge tone="danger" dot>
                Stopped
              </Badge>
            )}
          </div>

          <blockquote className="mt-5 max-h-24 overflow-y-auto rounded-lg border border-hair bg-inset px-3 py-2.5 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-ink-2">
            {prompt}
          </blockquote>

          <div className="mt-6">
            <AIProgress steps={stepsAt(BUILD_STEPS, progress.index, failed)} />
          </div>

          {/* The raw signal, verbatim. Everything above is an interpretation of
              the stream; this is the stream. If the two ever disagree, this one
              is right. */}
          {running && (
            <div className="mt-4 flex items-center gap-2 border-t border-hair pt-4 text-xs text-ink-3">
              <Spinner size={13} className="shrink-0 text-brand" />
              <span className="truncate">
                {progress.line ?? "Waiting for the first signal from the build…"}
              </span>
            </div>
          )}

          {progress.repairs > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-tint px-3 py-2 text-xs leading-relaxed text-warn">
              <Hammer size={14} className="mt-px shrink-0" />
              <span>
                The output didn’t compile, so Kodely went back and fixed it (
                <span className="k-num">{progress.repairs}</span>{" "}
                {progress.repairs === 1 ? "pass" : "passes"}). Repair passes are not charged to
                you.
              </span>
            </p>
          )}

          {progress.filesTouched > 0 && (
            <p className="k-num mt-3 text-xs text-ink-3">
              {progress.filesTouched} file{progress.filesTouched === 1 ? "" : "s"} written so far
            </p>
          )}

          {succeeded && progress.credits !== null && (
            <p className="mt-4 rounded-lg border border-hair bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
              Charged <span className="k-num font-semibold text-ink">{progress.credits}</span>{" "}
              credits.
              {progress.remaining !== null && (
                <>
                  {" "}
                  You have <span className="k-num font-semibold text-ink">
                    {progress.remaining}
                  </span>{" "}
                  left.
                </>
              )}
            </p>
          )}

          {failed && progress.error !== null && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-tint px-3 py-2.5 text-xs leading-relaxed text-danger"
            >
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>{progress.error}</span>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-hair pt-5">
            {running && (
              <>
                <Button variant="secondary" onClick={onStop} loading={stopping}>
                  {stopping ? "Stopping" : "Stop the build"}
                </Button>
                <p className="text-xs leading-relaxed text-ink-3">
                  Keep this tab open — leaving stops the build. A stopped build is never charged.
                </p>
              </>
            )}

            {succeeded && projectId !== null && (
              <ButtonLink href={`/projects/${projectId}`} variant="primary">
                Open the builder
              </ButtonLink>
            )}

            {failed && (
              <>
                {onRetry !== null ? (
                  <Button variant="primary" onClick={onRetry}>
                    Try again
                  </Button>
                ) : (
                  projectId !== null && (
                    <ButtonLink href={`/projects/${projectId}`} variant="primary">
                      Open the project
                    </ButtonLink>
                  )
                )}
                <Button variant="ghost" onClick={onEdit}>
                  Edit the brief
                </Button>
              </>
            )}
          </div>

          {failed && onRetry === null && projectId !== null && (
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              The project exists and holds whatever was written before it stopped. Carry on from
              inside the builder — retrying from here would be recorded as an edit to a
              half-finished site rather than a fresh first build.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

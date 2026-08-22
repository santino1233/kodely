import type { ReactNode } from "react";

export type StepState = "done" | "active" | "pending" | "failed";
export type ProgressStep = { id: string; label: string; state: StepState };

/* THE single AI-progress component. The initial build overlay, the chat panel
   during an edit, and the preview's busy state all render this same list, so
   "Kodely is working" looks like one object the customer follows across three
   places rather than three unrelated spinners.

   Why a step LIST and not a percentage: the build genuinely does not know how
   far along it is — it is an agent loop of unknown length — and a progress bar
   that jumps or stalls at 80% is a worse lie than an honest sequence of named
   steps. What it does know is which phase it is in, so that is what is shown.

   Callers must drive `state` from real signals. A timer that walks the list
   forward on its own would be a fake, and would still be sitting on
   "Finalizing" long after a build had failed. */
export function AIProgress({
  steps,
  className = "",
}: {
  steps: ProgressStep[];
  className?: string;
}) {
  return (
    <ol
      className={`flex flex-col gap-2 ${className}`}
      // Each step's arrival is announced once as it changes, which is the
      // whole point of the component for a screen-reader user — they get the
      // same "it is working, here is where it is" that sighted users get.
      aria-live="polite"
      aria-atomic="false"
    >
      {steps.map((s, i) => (
        <li
          key={s.id}
          className="k-step-in flex items-center gap-2.5 text-[0.8125rem]"
          style={{ animationDelay: `${i * 55}ms` }}
        >
          <StepIcon state={s.state} />
          <span
            className={
              s.state === "pending"
                ? "text-ink-3"
                : s.state === "failed"
                  ? "text-danger"
                  : s.state === "active"
                    ? "font-medium text-ink"
                    : "text-ink-2"
            }
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }): ReactNode {
  if (state === "done") {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ok-tint">
        <svg viewBox="0 0 24 24" className="size-2.5 text-ok" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 12.5 5 5L20 7" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-danger-tint">
        <svg viewBox="0 0 24 24" className="size-2.5 text-danger" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="grid size-4 shrink-0 place-items-center">
        <span className="k-step-active size-2.5 rounded-full bg-brand" />
      </span>
    );
  }
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <span className="size-2.5 rounded-full border border-line-strong" />
    </span>
  );
}

/** Advances a step list to `activeIndex`. Kept here so the two callers cannot
    disagree about what "everything before the active one is done" means. */
export function stepsAt(labels: readonly { id: string; label: string }[], activeIndex: number, failed = false): ProgressStep[] {
  return labels.map((l, i) => ({
    ...l,
    state:
      i < activeIndex ? "done" : i === activeIndex ? (failed ? "failed" : "active") : "pending",
  }));
}

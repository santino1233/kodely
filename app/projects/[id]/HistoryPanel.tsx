"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

// Version history. Every row is a real, restorable checkpoint — a successful
// build whose `filesSnapshot` still exists.
//
// TWO TRUTHS THIS PANEL HAS TO CARRY, because getting either wrong turns a
// safety net into a trap:
//
//  1. HISTORY IS BOUNDED. lib/retention.ts clears `filesSnapshot` on any build
//     that is BOTH past the newest 20 for its project AND older than 30 days
//     (SNAPSHOT_KEEP_PER_PROJECT = 20, SNAPSHOT_MIN_AGE_DAYS = 30). Both the
//     server list route and page.tsx filter on the snapshot surviving, so a
//     cleared checkpoint stops appearing rather than sitting here as a row
//     that 404s when clicked. The footnote says so out loud, because "my
//     history only goes back so far" is otherwise discovered as a bug.
//  2. RESTORING IS NOT A REFUND. It writes an old tree back over the draft.
//     It does not cancel the build it steps over, does not return its credits
//     and does not un-publish anything. It is itself free — see the restore
//     route — and that is a different claim.
//
// WHAT IS NOT HERE, because it does not exist: an arbitrary A-vs-B compare.
// loadBuildDiff() answers exactly one question — what did THIS build change
// against the newest earlier surviving checkpoint — so "Compare" is offered as
// that, and DiffView names the checkpoint it compared against.

export type BuildCheckpoint = {
  id: string;
  prompt: string;
  createdAt: string;
  filesWritten: number;
};

/** Only rendered after a click (the panel is never the first view), so a
    relative time cannot cause a hydration mismatch. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function HistoryPanel({
  builds,
  cursor,
  dirty,
  restoring,
  busy,
  onOpenDiff,
  onRestore,
}: {
  builds: BuildCheckpoint[];
  /** The checkpoint the draft currently matches, when we know it. */
  cursor: string | null;
  /** Something unversioned (a Brand or SEO save) sits on top of the cursor. */
  dirty: boolean;
  restoring: string | null;
  busy: boolean;
  onOpenDiff: (buildId: string) => void;
  onRestore: (build: BuildCheckpoint) => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-canvas p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="k-h1 text-ink">Version history</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-2">
          Every successful build is a restore point. Restoring writes that
          version back over your draft — it doesn’t cancel anything that came after it, and it
          doesn’t refund the credits those builds cost. Restoring itself is free.
        </p>

        {builds.length === 0 ? (
          <EmptyState
            className="mt-6"
            kind="empty"
            title="No checkpoints yet"
            body="The first successful build becomes your first restore point."
          />
        ) : (
          <>
            <ul className="mt-5 flex flex-col gap-2">
              {builds.map((b, i) => {
                const here = b.id === cursor;
                return (
                  <li
                    key={b.id}
                    className={[
                      "rounded-lg border bg-surface p-3 shadow-e1 transition-colors duration-[var(--t-1)]",
                      here ? "border-brand/45" : "border-hair",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {i === 0 && <Badge tone="neutral">Latest</Badge>}
                          {here && (
                            <Badge tone="brand" dot>
                              {dirty ? "Your draft came from here" : "Your draft is here"}
                            </Badge>
                          )}
                          {/* A real, stable identifier rather than an invented
                              "v7": the list is pruned, so a sequence number
                              counted from what survives would silently
                              renumber itself as old snapshots are cleared. */}
                          <span className="k-num font-mono text-[0.6875rem] text-ink-3">
                            {b.id.slice(0, 7)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-snug text-ink">{b.prompt}</p>
                        <p className="k-num mt-1 text-[0.75rem] text-ink-3">
                          <time
                            dateTime={b.createdAt}
                            title={new Date(b.createdAt).toLocaleString()}
                          >
                            {ago(b.createdAt)}
                          </time>{" "}
                          · {b.filesWritten} file{b.filesWritten === 1 ? "" : "s"} touched
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          className="border border-hair"
                          onClick={() => onOpenDiff(b.id)}
                          aria-label={`See what the build “${b.prompt}” changed`}
                        >
                          {i === builds.length - 1 ? "View files" : "Compare"}
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => onRestore(b)}
                          loading={restoring === b.id}
                          disabled={busy || (here && !dirty)}
                          title={
                            here && !dirty
                              ? "Your draft already matches this checkpoint"
                              : "Write this version back over your draft"
                          }
                        >
                          Restore
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 max-w-prose text-[0.75rem] leading-relaxed text-ink-3">
              History is bounded on purpose. Kodely always keeps the{" "}
              <span className="k-num">20</span> most recent checkpoints for a project; anything
              older than that <em>and</em> more than <span className="k-num">30</span> days old
              has its files cleared to save storage and drops off this list. Nothing you can see
              here has been cleared — a checkpoint that can’t restore is never shown.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

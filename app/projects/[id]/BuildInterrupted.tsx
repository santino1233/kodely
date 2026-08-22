"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

// What the user sees when a build ends without finishing. Two causes, and they
// are NOT the same story, so they do not get the same message.
//
// Everything below was checked against app/api/generate/route.ts rather than
// assumed:
//
//  * The route's ReadableStream has a cancel() that calls abortController
//    .abort(). Aborting the client fetch triggers it.
//  * On that path `succeeded` stays false, so the Build row is written
//    status: FAILED, creditsCharged: 0, error "Client disconnected." The
//    ledger is never touched. Stopping is genuinely free.
//  * The compiled tree (kind: "build") is only replaced inside the success
//    branch, and /api/preview serves kind: "build" — so after a stop the
//    preview keeps showing the last version that compiled, always.
//  * Whether a stopped build leaves PARTIAL files behind depends on the
//    engine, so the copy must not state it as a fact. On the `api` engine
//    onWrite persists each file as the tool call happens, so a stop does
//    leave half-finished source. On the `sdk` engine — which is what
//    KODELY_ENGINE selects here — lib/agent-sdk.ts returns at
//    `if (opts.signal?.aborted) return;` BEFORE the loop that diffs the work
//    directory back through onWrite, so an aborted build persists nothing at
//    all. The previous copy asserted the `api` behaviour unconditionally and
//    was simply wrong on the engine this deployment runs.
//    So the caller passes `wroteFiles` — did this client actually observe
//    `file` events — and the bullet appears only when it did. When none were
//    seen we say nothing rather than assert a negative, because a write that
//    landed server-side just as the abort hit could have had its event cut
//    off in flight.
//  * The user's prompt was written to the messages table before streaming
//    started; the assistant's partial reply was not. So the prompt survives a
//    reload and the half-written reply does not.
//
// The connection-loss case is deliberately vaguer, because the truth is
// vaguer. A dropped TCP connection does not always reach the server as a
// cancel — if it does, the build is abandoned and costs nothing; if it does
// not (half-open socket, laptop asleep), the build runs to completion on the
// server, saves its files and charges for them. From the browser these two
// are indistinguishable. There is no resume, no reattach and no polling
// endpoint for an in-flight build, so the only honest instruction is
// "reload and look".

export type Interruption = "stopped" | "connection-lost";

export default function BuildInterrupted({
  kind,
  wroteFiles,
  onDismiss,
}: {
  kind: Interruption;
  /** True only if the client actually saw `file` events before the stop. */
  wroteFiles: boolean;
  onDismiss: () => void;
}) {
  const stopped = kind === "stopped";

  return (
    <div
      role="status"
      aria-live="polite"
      className="k-msg-in rounded-lg border border-hair bg-surface-2/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* `warn`, not `danger`: neither of these is an error. One is something
            the customer asked for and the other is a network, and colouring
            them red would make a deliberate Stop read as a failure. */}
        <Badge tone="warn" dot>
          {stopped ? "Stopped" : "Disconnected"}
        </Badge>
        <p className="k-h2 text-ink">
          {stopped ? "Build stopped" : "Lost connection to the build"}
        </p>
      </div>

      {stopped ? (
        <ul className="mt-2 space-y-1 text-[0.75rem] leading-relaxed text-ink-2">
          <li>
            You weren&rsquo;t charged. A stopped build costs <span className="k-num">0</span>{" "}
            credits.
          </li>
          <li>
            Your preview and published site are untouched — they still show the last version that
            finished compiling.
          </li>
          {wroteFiles && (
            <li>
              Files the build had already written are kept in Code, so the source is part-way
              through the change.
            </li>
          )}
        </ul>
      ) : (
        <ul className="mt-2 space-y-1 text-[0.75rem] leading-relaxed text-ink-2">
          <li>
            The build was still running when the stream to your browser ended. There is no way to
            reattach to it from here.
          </li>
          <li>
            It either stopped on the server — in which case it cost you nothing — or ran to the end
            and saved. We can&rsquo;t tell which from this tab.
          </li>
          <li>Reload to see where your project and credit balance actually stand.</li>
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="xs" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

/* THE DANGER ZONE — the same two-step erasure that /legal/rights offers,
   surfaced where someone closing their account will actually look for it.

   NO LOGIC IS DUPLICATED. Every decision — whether a request exists, whether
   the grace period has elapsed, what would be destroyed, what survives and why
   — lives in app/api/account/_deletion.ts and the two routes over it. The
   status and the preview here are rendered by the SERVER from those same
   functions, and these three buttons call those same routes. This file
   contributes markup and confirmation wording, nothing else.

   The marketing panel at /legal/rights keeps its own copy on purpose: that
   page has to work for someone who cannot reach the portal, and it is the
   address the deletion email points at. */

export type DeletionView =
  | { state: "none" }
  | { state: "pending"; requestedAt: string; scheduledFor: string; timeLeft: string }
  | { state: "due"; requestedAt: string; scheduledFor: string }
  | { state: "erased"; erasedAt: string };

export type DeletionCounts = {
  projects: number;
  liveSites: number;
  files: number;
  messages: number;
  builds: number;
  sessions: number;
  supportNotes: number;
  /** Threads the customer opened on /support — their words, so they go. */
  supportTickets: number;
  /** Every turn in those threads, both sides. */
  supportMessages: number;
  emailsSent: number;
  analyticsEvents: number;
  creditLedgerRows: number;
  creditBalance: number;
};

type Receipt = {
  projectsDeleted: number;
  liveSitesWithdrawn: number;
  filesDeleted: number;
  messagesDeleted: number;
  buildsDeleted: number;
  sessionsEnded: number;
  analyticsEventsDetached: number;
  supportNotesDeleted: number;
  supportTicketsDeleted: number;
  supportMessagesDeleted: number;
  emailRecordsDeleted: number;
  creditLedgerRowsRetained: number;
  moderationFindingsRetained: number;
};

function Rows({ items }: { items: [string, number | string][] }) {
  return (
    <dl className="mt-2 text-[0.8125rem]">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-hair py-1.5 last:border-0"
        >
          <dt className="text-ink-2">{label}</dt>
          <dd className="k-num font-medium text-ink">
            {typeof value === "number" ? value.toLocaleString() : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function DeleteAccountPanel({
  view,
  counts,
  graceDays,
  confirmationPhrase,
  contactEmail,
}: {
  view: DeletionView;
  counts: DeletionCounts;
  graceDays: number;
  confirmationPhrase: string;
  contactEmail: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [refreshing, startTransition] = useTransition();

  const phraseOk = phrase === confirmationPhrase;
  const working = busy || refreshing;

  async function send(method: "POST" | "DELETE", url: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ confirm: phrase }) : undefined,
      });
      const data = (await res.json()) as { error?: string; receipt?: Receipt };
      if (!res.ok) {
        setError(data.error ?? "That did not work. Try again.");
        return;
      }
      if (data.receipt) {
        // The account is gone and the session with it. Nothing on this page can
        // be refreshed any more, so the receipt replaces the panel in place —
        // it is the only chance to read what happened.
        setReceipt(data.receipt);
        return;
      }
      setPhrase("");
      toast({
        tone: "ok",
        message:
          method === "DELETE"
            ? "Deletion request cancelled. Nothing was deleted."
            : `Deletion requested. Nothing is deleted for ${graceDays} days, and we have emailed you.`,
      });
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div>
        <h3 className="k-h2 text-ink">Your account has been deleted</h3>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
          You are signed out. Here is exactly what happened.
        </p>

        <p className="k-label mt-5">Destroyed</p>
        <Rows
          items={[
            ["Projects", receipt.projectsDeleted],
            ["Published sites taken offline", receipt.liveSitesWithdrawn],
            ["Files", receipt.filesDeleted],
            ["Chat messages", receipt.messagesDeleted],
            ["Build records and snapshots", receipt.buildsDeleted],
            ["Sign-in sessions", receipt.sessionsEnded],
            ["Support threads", receipt.supportTicketsDeleted],
            ["Messages in those threads", receipt.supportMessagesDeleted],
            ["Operator notes", receipt.supportNotesDeleted],
            ["Email delivery records", receipt.emailRecordsDeleted],
            ["Email, name, password, linked accounts", "all"],
          ]}
        />

        <p className="k-label mt-5">Kept</p>
        <Rows
          items={[
            ["Credit ledger entries", receipt.creditLedgerRowsRetained],
            ["Analytics events (detached, not deleted)", receipt.analyticsEventsDetached],
            ["Publish moderation findings", receipt.moderationFindingsRetained],
          ]}
        />
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
          None of the kept rows carries your email address, your name or your sign-in details. Why
          each one survives is set out in full on{" "}
          <Link
            href="/legal/rights"
            className="k-focus rounded-xs text-brand underline underline-offset-2 hover:no-underline"
          >
            Your data and your rights
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="k-h2 text-ink">Delete your account</h3>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
            Irreversible. There is no soft-delete, no undo and no backup anyone here can restore
            from.
          </p>
        </div>
        {view.state === "pending" && (
          <Badge tone="warn" dot pulse>
            Deletion requested
          </Badge>
        )}
        {view.state === "due" && (
          <Badge tone="danger" dot pulse>
            Awaiting final confirmation
          </Badge>
        )}
      </div>

      {view.state === "none" && (
        <>
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-2">
            This is a request, not a button that fires immediately. Nothing is destroyed for{" "}
            <span className="font-medium text-ink">{graceDays} days</span>, your account keeps
            working in the meantime, we email you the moment a request is made, and you can cancel
            at any point before you confirm it.
          </p>

          <p className="k-label mt-5">What would be destroyed</p>
          <Rows
            items={[
              ["Projects", counts.projects],
              ["Published sites (taken offline)", counts.liveSites],
              ["Files", counts.files],
              ["Chat messages", counts.messages],
              ["Build records and snapshots", counts.builds],
              ["Sign-in sessions", counts.sessions],
              ["Support threads", counts.supportTickets],
              ["Messages in those threads", counts.supportMessages],
              ["Operator notes", counts.supportNotes],
              ["Email delivery records", counts.emailsSent],
              ["Email, name, password, linked accounts", "all"],
            ]}
          />

          <p className="k-label mt-5">What would be kept</p>
          <Rows
            items={[
              ["Credit ledger entries", counts.creditLedgerRows],
              ["Analytics events (detached, not deleted)", counts.analyticsEvents],
            ]}
          />
          {counts.creditBalance > 0 && (
            <p className="mt-3 text-[0.8125rem] text-ink-2">
              Your balance of{" "}
              <span className="k-num font-medium text-ink">
                {counts.creditBalance.toLocaleString()}
              </span>{" "}
              credits goes with the account. Deleting is not a refund.
            </p>
          )}

          <div className="mt-5 max-w-sm">
            <Input
              label={`Type ${confirmationPhrase} to request deletion`}
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value);
                setError(null);
              }}
              error={error ?? undefined}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>

          <Button
            variant="danger"
            size="sm"
            className="mt-4"
            disabled={!phraseOk}
            loading={working}
            onClick={() => void send("POST", "/api/account/deletion")}
          >
            Request deletion
          </Button>
        </>
      )}

      {view.state === "pending" && (
        <>
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-2">
            Requested <span className="k-num text-ink">{view.requestedAt}</span>.{" "}
            <span className="font-medium text-ink">Nothing has been deleted.</span> This request can
            be carried out from <span className="k-num text-ink">{view.scheduledFor}</span> — about{" "}
            {view.timeLeft} away. Until you come back and confirm it after that date, your account
            works exactly as before.
          </p>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
            Did not request this? Someone else may have access to your account. Cancel below, then
            sign out every other session above.
          </p>
          {error != null && <p className="mt-3 text-xs text-danger">{error}</p>}
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={working}
            onClick={() => void send("DELETE", "/api/account/deletion")}
          >
            Cancel this request
          </Button>
        </>
      )}

      {view.state === "due" && (
        <>
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-2">
            Requested <span className="k-num text-ink">{view.requestedAt}</span>. The {graceDays}
            -day wait ended <span className="k-num text-ink">{view.scheduledFor}</span>.{" "}
            <span className="font-medium text-ink">Nothing has been deleted yet</span> — confirming
            below is the irreversible step, and it destroys{" "}
            <span className="k-num">{counts.projects}</span> project
            {counts.projects === 1 ? "" : "s"}
            {counts.liveSites > 0 && (
              <>
                , taking <span className="k-num">{counts.liveSites}</span> published site
                {counts.liveSites === 1 ? "" : "s"} offline
              </>
            )}
            .
          </p>

          <div className="mt-5 max-w-sm">
            <Input
              label={`Type ${confirmationPhrase} once more to delete permanently`}
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value);
                setError(null);
              }}
              error={error ?? undefined}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              disabled={!phraseOk}
              loading={working}
              onClick={() => void send("POST", "/api/account/deletion/confirm")}
            >
              Delete my account permanently
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={working}
              onClick={() => void send("DELETE", "/api/account/deletion")}
            >
              Cancel this request
            </Button>
          </div>
        </>
      )}

      {view.state === "erased" && (
        <p className="mt-4 text-[0.8125rem] text-ink-2">
          This account was erased on <span className="k-num text-ink">{view.erasedAt}</span>.
        </p>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        The full account of what deletion destroys, what survives it and why is on{" "}
        <Link
          href="/legal/rights"
          className="k-focus rounded-xs underline underline-offset-2 hover:no-underline"
        >
          Your data and your rights
        </Link>
        . If you would rather not come back to finish the second step, email{" "}
        <a
          href={`mailto:${contactEmail}`}
          className="k-focus rounded-xs underline underline-offset-2 hover:no-underline"
        >
          {contactEmail}
        </a>{" "}
        once the wait is up and a person will complete it.
      </p>
    </div>
  );
}

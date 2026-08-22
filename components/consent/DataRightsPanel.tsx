"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// ── Why this lives in components/consent/ ─────────────────────────────────
//
// The board card that produced this work reads "Cookie consent + GDPR/CCPA
// data rights", and this directory was named for the first half of it. There
// is no consent UI here, deliberately: the audit behind /legal/rights found
// three cookies on kodely.me, all of them strictly necessary (a sign-in
// session and two ten-minute OAuth anti-forgery tokens) and no third-party
// tracker anywhere. A banner over that set would ask permission for nothing,
// change nothing whichever button was pressed, and teach people that dismissing
// dialogs is how the web works. What the card is actually asking for is the
// second half — the rights themselves — which is what this panel does.

type Status =
  | { state: "none" }
  | { state: "pending"; requestedAt: string; scheduledFor: string; hoursLeft: number }
  | { state: "due"; requestedAt: string; scheduledFor: string }
  | { state: "erased"; erasedAt: string };

type Preview = {
  projects: number;
  liveSites: number;
  files: number;
  messages: number;
  builds: number;
  sessions: number;
  analyticsEvents: number;
  supportNotes: number;
  supportTickets: number;
  supportMessages: number;
  emailsSent: number;
  creditLedgerRows: number;
  creditBalance: number;
};

type Receipt = {
  erasedAt: string;
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

type Loaded = {
  status: Status;
  preview: Preview;
  graceDays: number;
  confirmationPhrase: string;
  contactEmail: string;
};

type Screen =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "ready"; data: Loaded }
  | { kind: "erased"; receipt: Receipt };

function formatDate(iso: string): string {
  // Rendered only after mount (this panel fetches its data), so a locale-
  // dependent string cannot produce a server/client hydration mismatch.
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

const cardClass =
  "rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:p-8";

const buttonClass =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

const quietButtonClass =
  "rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500";

const dangerButtonClass =
  "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-neutral-200 py-1.5 last:border-0 dark:border-neutral-800">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

export default function DataRightsPanel() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportCooling, setExportCooling] = useState(false);

  // Returns the next screen rather than setting it, so the effect below can
  // drop the result if the panel has already unmounted, and so nothing here
  // sets state synchronously inside an effect body.
  const loadScreen = useCallback(async (): Promise<Screen> => {
    try {
      const res = await fetch("/api/account/deletion", { cache: "no-store" });
      if (res.status === 401) return { kind: "signed-out" };
      if (!res.ok) return { kind: "unavailable" };
      return { kind: "ready", data: (await res.json()) as Loaded };
    } catch {
      return { kind: "unavailable" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadScreen().then((next) => {
      if (!cancelled) setScreen(next);
    });
    return () => {
      cancelled = true;
    };
  }, [loadScreen]);

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
        setScreen({ kind: "erased", receipt: data.receipt });
        return;
      }
      setPhrase("");
      setScreen(await loadScreen());
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (screen.kind === "loading") {
    return (
      <div className={cardClass}>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Checking your account…</p>
      </div>
    );
  }

  if (screen.kind === "signed-out") {
    return (
      <div className={cardClass}>
        <h3 className="text-base font-semibold tracking-tight">Your data, on your account</h3>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Sign in and the download and deletion tools appear here. If you cannot sign in, email{" "}
          <a className="underline underline-offset-2" href="mailto:privacy@kodely.me">
            privacy@kodely.me
          </a>{" "}
          and we will handle it by hand.
        </p>
        <div className="mt-5 flex gap-3">
          <Link href="/login" className={buttonClass}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (screen.kind === "unavailable") {
    return (
      <div className={cardClass}>
        <h3 className="text-base font-semibold tracking-tight">Tools unavailable right now</h3>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          We could not load your account. Reload the page, or email{" "}
          <a className="underline underline-offset-2" href="mailto:privacy@kodely.me">
            privacy@kodely.me
          </a>{" "}
          — a request by email carries exactly the same weight as the buttons here.
        </p>
      </div>
    );
  }

  if (screen.kind === "erased") {
    const r = screen.receipt;
    return (
      <div className={cardClass}>
        <h3 className="text-base font-semibold tracking-tight">Your account has been deleted</h3>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Completed {formatDate(r.erasedAt)}. You are signed out. Here is exactly what happened.
        </p>

        <div className="mt-5 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
            Destroyed
          </p>
          <div className="mt-2">
            <Row label="Projects" value={String(r.projectsDeleted)} />
            <Row label="Published sites taken offline" value={String(r.liveSitesWithdrawn)} />
            <Row label="Files" value={String(r.filesDeleted)} />
            <Row label="Chat messages" value={String(r.messagesDeleted)} />
            <Row label="Build records and snapshots" value={String(r.buildsDeleted)} />
            <Row label="Sign-in sessions" value={String(r.sessionsEnded)} />
            <Row label="Support tickets" value={String(r.supportTicketsDeleted)} />
            <Row label="Support messages" value={String(r.supportMessagesDeleted)} />
            <Row label="Operator notes" value={String(r.supportNotesDeleted)} />
            <Row label="Email delivery records" value={String(r.emailRecordsDeleted)} />
            <Row label="Email, name, password, linked accounts" value="all" />
          </div>
        </div>

        <div className="mt-5 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">Kept</p>
          <div className="mt-2">
            <Row label="Credit ledger entries" value={String(r.creditLedgerRowsRetained)} />
            <Row label="Analytics events (detached, not deleted)" value={String(r.analyticsEventsDetached)} />
            <Row label="Publish moderation findings" value={String(r.moderationFindingsRetained)} />
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            None of the kept rows carries your email address, your name or your sign-in details.
            Why each one survives is set out above under{" "}
            <span className="font-medium">What deletion keeps</span>.
          </p>
        </div>
      </div>
    );
  }

  const { status, preview, graceDays, confirmationPhrase } = screen.data;
  const phraseOk = phrase === confirmationPhrase;

  return (
    <div className="space-y-6">
      {/* ── Access ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h3 className="text-base font-semibold tracking-tight">Download everything we hold</h3>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          One JSON file: your account, every project with its files, chat messages and build
          records, your credit ledger, your analytics events, your support tickets and their replies, any
          operator notes about you, and
          the social connections behind reward credits. The file names what it deliberately leaves
          out, and why.
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          It is generated as it downloads, so a large account takes a moment to start.
        </p>
        <div className="mt-5">
          {exportCooling ? (
            <span className={`${buttonClass} pointer-events-none inline-block opacity-50`}>
              Preparing your download…
            </span>
          ) : (
            <a
              href="/api/account/export"
              className={`${buttonClass} inline-block`}
              onClick={() => {
                // The route allows one export a minute. Matching that here
                // means a double-click never lands on the throttle.
                setExportCooling(true);
                window.setTimeout(() => setExportCooling(false), 60_000);
              }}
            >
              Download my data (JSON)
            </a>
          )}
        </div>
      </div>

      {/* ── Erasure ────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h3 className="text-base font-semibold tracking-tight">Delete your account</h3>

        {status.state === "none" && (
          <>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              This is a request, not a button that fires immediately. Nothing is destroyed for{" "}
              <span className="font-medium">{graceDays} days</span>, your account keeps working in
              the meantime, we email you as soon as a request is made, and you can cancel at any
              point before you confirm it.
            </p>

            <div className="mt-5 text-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                What would be destroyed
              </p>
              <div className="mt-2">
                <Row label="Projects" value={String(preview.projects)} />
                <Row label="Published sites (taken offline)" value={String(preview.liveSites)} />
                <Row label="Files" value={String(preview.files)} />
                <Row label="Chat messages" value={String(preview.messages)} />
                <Row label="Build records and snapshots" value={String(preview.builds)} />
                <Row label="Sign-in sessions" value={String(preview.sessions)} />
                <Row label="Support tickets" value={String(preview.supportTickets)} />
                <Row label="Support messages" value={String(preview.supportMessages)} />
                <Row label="Operator notes" value={String(preview.supportNotes)} />
                <Row label="Email delivery records" value={String(preview.emailsSent)} />
                <Row label="Email, name, password, linked accounts" value="all" />
              </div>
            </div>

            <div className="mt-5 text-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                What would be kept
              </p>
              <div className="mt-2">
                <Row label="Credit ledger entries" value={String(preview.creditLedgerRows)} />
                <Row
                  label="Analytics events (detached, not deleted)"
                  value={String(preview.analyticsEvents)}
                />
              </div>
              {preview.creditBalance > 0 && (
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                  Your balance of{" "}
                  <span className="font-medium tabular-nums">{preview.creditBalance}</span> credits
                  goes with the account. Deleting is not a refund.
                </p>
              )}
            </div>

            <label className="mt-6 block text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">
                Type <span className="font-mono font-medium">{confirmationPhrase}</span> to request
                deletion.
              </span>
              <input
                value={phrase}
                onChange={(e) => {
                  setPhrase(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full max-w-sm rounded-lg border border-neutral-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!phraseOk || busy}
                onClick={() => void send("POST", "/api/account/deletion")}
                className={dangerButtonClass}
              >
                {busy ? "Sending…" : "Request deletion"}
              </button>
            </div>
          </>
        )}

        {status.state === "pending" && (
          <>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Requested {formatDate(status.requestedAt)}.{" "}
              <span className="font-medium">Nothing has been deleted.</span> This request can be
              carried out from {formatDate(status.scheduledFor)} — about {status.hoursLeft} hour
              {status.hoursLeft === 1 ? "" : "s"} away. Until you confirm it after that date,
              your account works exactly as before.
            </p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Did not request this? Someone else may have access to your account. Cancel below and
              change your password.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("DELETE", "/api/account/deletion")}
                className={quietButtonClass}
              >
                {busy ? "Cancelling…" : "Cancel this request"}
              </button>
            </div>
          </>
        )}

        {status.state === "due" && (
          <>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Requested {formatDate(status.requestedAt)}. The {graceDays}-day wait ended{" "}
              {formatDate(status.scheduledFor)}.{" "}
              <span className="font-medium">Nothing has been deleted yet</span> — confirming below
              is the irreversible step, and it destroys{" "}
              {preview.projects} project{preview.projects === 1 ? "" : "s"}
              {preview.liveSites > 0
                ? `, taking ${preview.liveSites} published site${preview.liveSites === 1 ? "" : "s"} offline`
                : ""}
              .
            </p>

            <label className="mt-5 block text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">
                Type <span className="font-mono font-medium">{confirmationPhrase}</span> once more
                to delete your account permanently.
              </span>
              <input
                value={phrase}
                onChange={(e) => {
                  setPhrase(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full max-w-sm rounded-lg border border-neutral-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!phraseOk || busy}
                onClick={() => void send("POST", "/api/account/deletion/confirm")}
                className={dangerButtonClass}
              >
                {busy ? "Deleting…" : "Delete my account permanently"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("DELETE", "/api/account/deletion")}
                className={quietButtonClass}
              >
                Cancel this request
              </button>
            </div>
          </>
        )}

        {status.state === "erased" && (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            This account was erased on {formatDate(status.erasedAt)}.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

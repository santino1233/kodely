"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* Active sessions, and the three ways to end them.

   Everything shown here is a fact the Session row actually holds: when the
   sign-in happened, when the session stops working, and which one is this
   browser. There is no device column, no browser column and no location,
   because the table records none of those — see app/api/account/_sessions.ts
   for what was considered and why nothing was invented.

   Dates arrive pre-formatted from the server. Formatting them here would
   produce one string during the server render and a different one on
   hydration, which is a mismatch React repaints over. */

export type DisplaySession = {
  id: string;
  current: boolean;
  createdAtIso: string;
  createdAtLabel: string;
  expiresAtIso: string;
  expiresAtLabel: string;
};

type Scope = "others" | "all";

export default function SessionList({
  sessions,
  total,
  others,
  limit,
}: {
  sessions: DisplaySession[];
  /** Live sessions in total, which may exceed `sessions.length` when truncated. */
  total: number;
  /**
   * Everything except the caller's own, counted on the server. Deriving it
   * from `sessions` would be wrong the moment the list is truncated and the
   * current session is not among the newest rows shown.
   */
  others: number;
  limit: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Scope | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();

  async function revoke(body: { id: string } | { scope: Scope }) {
    const res = await fetch("/api/account/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: (await res.json()) as { revoked?: number; signedOut?: boolean; error?: string } };
  }

  async function revokeOne(id: string) {
    setRevoking(id);
    try {
      const { res, data } = await revoke({ id });
      if (!res.ok) {
        toast({ tone: "danger", message: data.error ?? "Couldn't end that session." });
        return;
      }
      toast({ tone: "ok", message: "That session was signed out." });
      startTransition(() => router.refresh());
    } catch {
      toast({ tone: "danger", message: "Couldn't reach the server. Try again." });
    } finally {
      setRevoking(null);
    }
  }

  async function revokeScope(scope: Scope) {
    setBulkBusy(true);
    try {
      const { res, data } = await revoke({ scope });
      if (!res.ok) {
        toast({ tone: "danger", message: data.error ?? "Couldn't end those sessions." });
        return;
      }
      setConfirming(null);
      if (data.signedOut) {
        // Every row is gone and the cookie has been cleared, so this page is
        // already unauthenticated. `replace`, not `push`: Back would otherwise
        // return to a Settings page that only bounces to /login again. The
        // refresh afterwards drops the cached authenticated segments, so
        // nothing signed-in is left in the client router cache.
        router.replace("/login");
        router.refresh();
        return;
      }
      const count = data.revoked ?? 0;
      toast({
        tone: "ok",
        message:
          count === 0
            ? "There were no other sessions to sign out."
            : `Signed out ${count} other session${count === 1 ? "" : "s"}.`,
      });
      startTransition(() => router.refresh());
    } catch {
      toast({ tone: "danger", message: "Couldn't reach the server. Try again." });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <ul className="mt-5 divide-y divide-hair rounded-lg border border-hair">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">
                  Signed in{" "}
                  <time className="k-num" dateTime={session.createdAtIso}>
                    {session.createdAtLabel}
                  </time>
                </span>
                {session.current && (
                  <Badge tone="ok" dot>
                    This device
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-3">
                Expires{" "}
                <time className="k-num" dateTime={session.expiresAtIso}>
                  {session.expiresAtLabel}
                </time>
              </p>
            </div>

            {session.current ? (
              <span className="text-xs text-ink-3">Sign out to end this one</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void revokeOne(session.id)}
                loading={revoking === session.id}
                disabled={bulkBusy || refreshing}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>

      {total > sessions.length && (
        <p className="mt-3 text-xs text-ink-3">
          Showing the {limit} most recent of{" "}
          <span className="k-num">{total.toLocaleString()}</span> active sessions. Signing out every
          other session below ends all of them, not just the ones listed.
        </p>
      )}

      {others > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming("others")}
            disabled={bulkBusy || refreshing}
          >
            Sign out {others === 1 ? "the other session" : `all ${others} other sessions`}
          </Button>
          <button
            type="button"
            className="k-focus rounded-xs text-xs text-danger underline underline-offset-2 hover:no-underline disabled:opacity-45"
            onClick={() => setConfirming("all")}
            disabled={bulkBusy || refreshing}
          >
            Sign out everywhere, including this device
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirming === "others"}
        onClose={() => setConfirming(null)}
        onConfirm={() => void revokeScope("others")}
        title="Sign out every other session?"
        confirmLabel="Sign out others"
        busy={bulkBusy}
        body={
          <>
            Every other browser and device signed in to this account is signed out immediately, and
            has to sign in again. You stay signed in here. Nothing else about your account changes —
            no project, file or credit is touched.
          </>
        }
      />

      <ConfirmModal
        open={confirming === "all"}
        onClose={() => setConfirming(null)}
        onConfirm={() => void revokeScope("all")}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        busy={bulkBusy}
        body={
          <>
            This one includes the browser you are using right now — you will be sent to the sign-in
            page and will need your password or Google account to get back in. Use it if you think
            somebody else has access. Nothing is deleted.
          </>
        }
      />
    </>
  );
}

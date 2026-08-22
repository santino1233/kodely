"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmented } from "@/components/ui/Segmented";

export type SubmissionRow = {
  id: string;
  formName: string;
  /** Ordered key/value pairs, already normalised and capped on the server. */
  fields: [string, string][];
  createdAt: string;
  read: boolean;
  spam: boolean;
};

/**
 * Every value below came from a stranger on the public internet.
 *
 * It is rendered as a React child — `{value}` — and nowhere in this file is
 * there a dangerouslySetInnerHTML, an href built from a field, or a value
 * passed to anything that would parse it. React escapes text children, so a
 * submission of `<img onerror=…>` shows up as those characters. Do not
 * "improve" this by auto-linking addresses or URLs without escaping first.
 */
function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-3 py-1">
      <div className="truncate text-[0.75rem] text-ink-3" title={name}>
        {name}
      </div>
      <div className="text-sm break-words whitespace-pre-wrap text-ink">{value}</div>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function SubmissionList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: SubmissionRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [showSpam, setShowSpam] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = rows.filter((r) => r.spam === showSpam);
  const spamCount = rows.filter((r) => r.spam).length;
  const unread = rows.filter((r) => !r.read && !r.spam).length;

  async function patch(body: { ids?: string[]; read?: boolean; spam?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      // Mirror the change locally rather than refetching: the server is the
      // authority, but nothing here depends on a value it computed.
      setRows((current) =>
        current.map((r) => {
          if (body.ids && !body.ids.includes(r.id)) return r;
          return {
            ...r,
            ...(body.read !== undefined ? { read: body.read } : {}),
            ...(body.spam !== undefined ? { spam: body.spam } : {}),
          };
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          name="kodely-submissions-box"
          ariaLabel="Inbox or filtered"
          size="sm"
          value={showSpam ? "spam" : "inbox"}
          onChange={(v) => setShowSpam(v === "spam")}
          options={[
            { value: "inbox", label: unread > 0 ? `Inbox (${unread})` : "Inbox" },
            { value: "spam", label: spamCount > 0 ? `Filtered (${spamCount})` : "Filtered" },
          ]}
        />
        <div className="grow" />
        {!showSpam && unread > 0 && (
          <Button size="xs" variant="ghost" className="border border-hair" disabled={busy} onClick={() => void patch({ read: true })}>
            Mark all read
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          // `no-results` rather than `empty`: there ARE submissions, the
          // current box just has none of them.
          kind="no-results"
          title={showSpam ? "Nothing filtered" : "Nothing in the inbox"}
          body={
            showSpam
              ? "Anything caught by the spam trap is kept here rather than thrown away."
              : "Everything that arrived has been filtered as spam. Check the Filtered box."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li
              key={r.id}
              className={`rounded-lg border bg-surface p-4 shadow-e1 ${
                r.read || r.spam ? "border-hair" : "border-brand/45"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-3">
                <span className="font-medium text-ink-2">{r.formName}</span>
                <time className="k-num" dateTime={r.createdAt}>
                  {when(r.createdAt)}
                </time>
                {!r.read && !r.spam && (
                  <Badge tone="brand" dot>
                    New
                  </Badge>
                )}
                <div className="grow" />
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void patch({ ids: [r.id], read: !r.read })}
                >
                  {r.read ? "Mark unread" : "Mark read"}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void patch({ ids: [r.id], spam: !r.spam })}
                >
                  {r.spam ? "Not spam" : "Mark spam"}
                </Button>
              </div>
              {r.fields.length === 0 ? (
                <p className="text-sm text-ink-3">(empty)</p>
              ) : (
                r.fields.map(([k, v]) => <Field key={k} name={k} value={v} />)
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

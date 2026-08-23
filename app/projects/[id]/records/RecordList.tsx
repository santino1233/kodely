"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmented } from "@/components/ui/Segmented";
import { setSiteRecordStatus, updateSiteRecordFields } from "./records-actions";

export type RecordRow = {
  id: string;
  kind: string;
  status: string;
  /** Ordered key/value pairs, already normalised and capped on the server. */
  fields: [string, string][];
  createdAt: string;
  spam: boolean;
};

/**
 * Every value below came from a stranger on the public internet.
 *
 * It is rendered as a React child — `{value}` — and nowhere in this file is
 * there a dangerouslySetInnerHTML, an href built from a field, or a value
 * passed to anything that would parse it. React escapes text children, so a
 * record of `<img onerror=…>` shows up as those characters. Do not "improve"
 * this by auto-linking addresses or URLs without escaping first. The one
 * place a field value becomes an editable INPUT's `value` (below, in edit
 * mode) is still safe for the same reason: React sets DOM properties, not
 * markup, so nothing there is parsed as HTML either.
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

const ALL = "__all__";

/**
 * One record's edit form — a plain controlled input per field, submitted
 * through updateSiteRecordFields (app/projects/[id]/records/records-actions.ts),
 * which applies the exact same validation the anonymous write path does.
 */
function EditForm({
  fields,
  onCancel,
  onSave,
  pending,
  error,
}: {
  fields: [string, string][];
  onCancel: () => void;
  onSave: (values: [string, string][]) => void;
  pending: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<[string, string][]>(fields);

  return (
    <div className="space-y-2">
      {draft.map(([k, v], i) => (
        <label key={k} className="block">
          <span className="mb-1 block text-[0.75rem] text-ink-3">{k}</span>
          <input
            value={v}
            onChange={(e) => {
              const next = [...draft];
              next[i] = [k, e.target.value];
              setDraft(next);
            }}
            className="k-focus w-full rounded-md border border-line-mid bg-surface px-2.5 py-1.5 text-sm text-ink"
          />
        </label>
      ))}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button size="xs" variant="primary" disabled={pending} onClick={() => onSave(draft)}>
          Save
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={onCancel}>
          Discard
        </Button>
      </div>
    </div>
  );
}

/**
 * `kind` is never a fixed list here — the tabs are built from whichever kinds
 * this project's own records actually used (page.tsx groups by kind), so a
 * generated site can invent any kind it needs and it shows up on its own.
 */
export default function RecordList({
  projectId,
  kinds,
  initial,
}: {
  projectId: string;
  kinds: string[];
  initial: RecordRow[];
}) {
  const [rows] = useState(initial);
  const [kind, setKind] = useState<string>(ALL);
  const [showSpam, setShowSpam] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byKind = rows.filter((r) => kind === ALL || r.kind === kind);
  const visible = byKind.filter((r) => r.spam === showSpam);
  const spamCount = byKind.filter((r) => r.spam).length;
  const activeCount = byKind.filter((r) => !r.spam).length;

  function clearError(id: string) {
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleStatus(r: RecordRow) {
    const nextStatus = r.status === "cancelled" ? "active" : "cancelled";
    startTransition(async () => {
      const result = await setSiteRecordStatus(projectId, r.id, nextStatus);
      if (result.ok) {
        clearError(r.id);
        router.refresh();
      } else {
        setErrors((prev) => ({ ...prev, [r.id]: result.error }));
      }
    });
  }

  function saveEdit(r: RecordRow, values: [string, string][]) {
    startTransition(async () => {
      const formData = new FormData();
      for (const [k, v] of values) formData.append(k, v);
      const result = await updateSiteRecordFields(projectId, r.id, formData);
      if (result.ok) {
        clearError(r.id);
        setEditingId(null);
        router.refresh();
      } else {
        setErrors((prev) => ({ ...prev, [r.id]: result.error }));
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {kinds.length > 1 && (
          <Segmented
            name="kodely-record-kind"
            ariaLabel="Filter by kind"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: ALL, label: "All" },
              ...kinds.map((k) => ({ value: k, label: k })),
            ]}
          />
        )}
        <div className="grow" />
        {spamCount > 0 && (
          <Button
            size="xs"
            variant="ghost"
            className="border border-hair"
            onClick={() => setShowSpam((v) => !v)}
          >
            {showSpam ? `Records (${activeCount})` : `Filtered (${spamCount})`}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          // `no-results` rather than `empty`: there ARE records, the current
          // filter just has none of them.
          kind="no-results"
          title={showSpam ? "Nothing filtered" : "Nothing here"}
          body={
            showSpam
              ? "Anything caught by the spam trap is kept here rather than thrown away."
              : "Everything that matches this filter has been caught by the spam trap."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-lg border border-hair bg-surface p-4 shadow-e1">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-3">
                <Badge tone="neutral">{r.kind}</Badge>
                {r.status !== "active" && <Badge tone="warn">{r.status}</Badge>}
                <time className="k-num" dateTime={r.createdAt}>
                  {when(r.createdAt)}
                </time>
                <div className="grow" />
                {!r.spam && editingId !== r.id && r.fields.length > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(r.id)}>
                    Edit
                  </Button>
                )}
                {!r.spam && (
                  <Button
                    size="xs"
                    variant={r.status === "cancelled" ? "secondary" : "danger"}
                    disabled={pending}
                    onClick={() => toggleStatus(r)}
                  >
                    {r.status === "cancelled" ? "Restore" : "Cancel"}
                  </Button>
                )}
              </div>

              {editingId === r.id ? (
                <EditForm
                  fields={r.fields}
                  pending={pending}
                  error={errors[r.id] ?? null}
                  onCancel={() => {
                    setEditingId(null);
                    clearError(r.id);
                  }}
                  onSave={(values) => saveEdit(r, values)}
                />
              ) : r.fields.length === 0 ? (
                <p className="text-sm text-ink-3">(empty)</p>
              ) : (
                r.fields.map(([k, v]) => <Field key={k} name={k} value={v} />)
              )}
              {editingId !== r.id && errors[r.id] && (
                <p className="mt-2 text-xs text-danger">{errors[r.id]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

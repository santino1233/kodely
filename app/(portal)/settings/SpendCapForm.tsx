"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

/* The user's own ceiling on 30-day spend. The route (app/api/account/
   spend-cap) is unchanged; this is the same PUT it always sent, wearing the
   product's own controls instead of a hand-rolled checkbox and a bare input. */

type Props = { initialCap: number | null; spent: number };

export default function SpendCapForm({ initialCap, spent }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initialCap !== null);
  const [value, setValue] = useState(initialCap === null ? "" : String(initialCap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    const cap = enabled ? Number(value) : null;
    if (enabled && (!Number.isInteger(cap) || (cap as number) < 1)) {
      setError("Enter a whole number of credits.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/account/spend-cap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cap }),
      });
      const data = (await res.json()) as { cap?: number | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      toast({
        tone: "ok",
        message:
          data.cap == null
            ? "Cap removed. Builds will run until your credits run out."
            : `Cap set to ${data.cap.toLocaleString()} credits per 30 days.`,
      });
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // A cap at or below what has already gone through the rolling window stops
  // builds the moment it is saved. That is a legitimate thing to want, but it
  // is almost never what someone typing a number expects, so it is said before
  // they press Save rather than discovered by a build refusing to start.
  const typed = Number(value);
  const stopsImmediately =
    enabled && Number.isInteger(typed) && typed >= 1 && typed <= spent;

  return (
    <div className="mt-5">
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setError(null);
          }}
          className="k-focus size-4 rounded-xs border-line-strong accent-brand"
        />
        Limit my spending
      </label>

      {enabled && (
        <div className="mt-4 max-w-xs">
          <Input
            label="Credits per 30 days"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            placeholder="1000"
            className="k-num"
          />
        </div>
      )}

      {!enabled && error != null && <p className="mt-3 text-xs text-danger">{error}</p>}

      {stopsImmediately && error == null && (
        <p className="mt-3 max-w-md text-xs leading-relaxed text-warn">
          You have already spent <span className="k-num">{spent.toLocaleString()}</span> credits in
          the last 30 days, so this cap stops builds as soon as you save it — until enough of that
          spend falls out of the rolling window.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* The one primary action on this page. */}
        <Button variant="primary" size="sm" onClick={save} loading={saving}>
          Save
        </Button>
        <span className="text-xs text-ink-3">
          {enabled
            ? "Builds stop when the cap is reached. Nothing else changes."
            : "No cap. Builds run until your credit balance runs out."}
        </span>
      </div>
    </div>
  );
}

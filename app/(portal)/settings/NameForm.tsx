"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { MAX_NAME_LENGTH } from "@/app/api/account/_profile";

/* The display name, and the only editable field on the account.
   PUTs /api/account/profile, then router.refresh() — the name is rendered by
   the sidebar, the avatar and the dashboard greeting, all of which are Server
   Components above this one, so a refresh is what makes the whole shell agree
   with the field instead of this input being the only thing that changed. */
export default function NameForm({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(initialName ?? "");
  const [value, setValue] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();

  // Compared against the last SAVED value rather than the initial prop, so the
  // button goes quiet again after a save instead of staying lit until a
  // navigation. Trimmed on both sides because trailing space is not an edit —
  // the server would normalise it away and report nothing changed.
  const dirty = value.trim() !== saved.trim();
  const busy = saving || refreshing;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Empty clears the name; the route treats "" and null identically.
        body: JSON.stringify({ name: value.trim() === "" ? null : value }),
      });
      const data = (await res.json()) as { name?: string | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      // Show what was STORED, not what was typed: the server collapses runs of
      // whitespace and strips invisible characters, and the field should not
      // keep claiming otherwise.
      const stored = data.name ?? "";
      setSaved(stored);
      setValue(stored);
      toast({
        tone: "ok",
        message: data.name === null ? "Name removed." : `Name saved as “${data.name}”.`,
      });
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !busy) void save();
      }}
    >
      <div className="max-w-sm">
        <Input
          label="Display name"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          hint={`Up to ${MAX_NAME_LENGTH} characters. Leave it empty to go by your email address instead.`}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          spellCheck={false}
          placeholder="Your name"
          disabled={busy}
        />
      </div>
      {/* The one primary action on this page. */}
      <Button type="submit" variant="primary" size="sm" className="mt-4" disabled={!dirty} loading={busy}>
        Save
      </Button>
    </form>
  );
}

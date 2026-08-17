"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

const PACKS = [
  { id: "starter", label: "500 credits — $9" },
  { id: "builder", label: "2,500 credits — $40" },
  { id: "pro", label: "6,000 credits — $90" },
];

export default function TopUpButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function buy(packId: string) {
    setLoading(true);
    try {
      const { url } = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ packId }),
      });
      window.location.href = url;
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't start checkout.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        Top up
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {PACKS.map((p) => (
        <button
          key={p.id}
          onClick={() => buy(p.id)}
          disabled={loading}
          className="rounded-lg border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/15"
        >
          {p.label}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="text-xs text-black/40 dark:text-white/40">
        cancel
      </button>
    </div>
  );
}

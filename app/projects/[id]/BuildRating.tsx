"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/Button";

// Thumbs up/down on the build that just finished.
//
// Kept deliberately small and easy to ignore. The moment someone has a working
// site is the moment they want to look at it, not fill in a survey — a modal
// here would buy a few more data points at the cost of the thing they came for.
//
// Thumbs-down opens a short reason list, because "it's bad" is not actionable
// and "the copy is generic" is. Thumbs-up submits immediately and stops: there
// is nothing to follow up on, and asking anyway reads as fishing.
//
// No aria-live in here. The editor has exactly one live region (the build
// progress list) and this sits inside the same chat column — the state changes
// are all direct consequences of the user's own click, so there is nothing to
// announce that they did not just do.

const REASONS: { id: string; label: string }[] = [
  { id: "looks-generic", label: "Looks generic" },
  { id: "wrong-content", label: "Wrong content" },
  { id: "layout-off", label: "Layout is off" },
  { id: "missing-something", label: "Missing something" },
  { id: "broken", label: "Something's broken" },
  { id: "other", label: "Other" },
];

export default function BuildRating({ buildId }: { buildId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [done, setDone] = useState(false);

  async function send(value: "up" | "down", reason?: string) {
    setRating(value);
    if (value === "up" || reason) setDone(true);

    // Fire and forget. A failed rating must never surface an error to someone
    // who was only trying to be helpful — it is our telemetry, not their task.
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId, rating: value, reason }),
      });
    } catch {
      // ignored on purpose — see above
    }
  }

  if (done) {
    return <p className="text-[0.6875rem] text-ink-3">Thanks — noted.</p>;
  }

  if (rating === "down") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[0.6875rem] text-ink-3">What was off?</p>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => void send("down", r.id)}
              className="k-focus rounded-full border border-hair bg-surface px-2.5 py-1 text-[0.6875rem] text-ink-2 transition-colors duration-[var(--t-1)] hover:border-line-mid hover:bg-surface-2 hover:text-ink"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex-1 text-[0.6875rem] text-ink-3">Was this what you wanted?</span>
      <IconButton
        label="Yes, this is what I wanted"
        size="xs"
        onClick={() => void send("up")}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 22V10l5-8a2.2 2.2 0 0 1 2 3l-1.4 5H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 21H7Z" />
          <path d="M7 10H4v11h3" />
        </svg>
      </IconButton>
      <IconButton label="No, this missed the mark" size="xs" onClick={() => void send("down")}>
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 2v12l-5 8a2.2 2.2 0 0 1-2-3l1.4-5H5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.4 3H17Z" />
          <path d="M17 14h3V3h-3" />
        </svg>
      </IconButton>
    </div>
  );
}

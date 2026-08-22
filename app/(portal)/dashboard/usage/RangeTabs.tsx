"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/Segmented";

/* The chart's range switch.
   ───────────────────────────────────────────────────────────────────────────
   This is the product's `Segmented` — real radios, arrow-key navigable, one
   tab stop — driving the URL rather than local state, because the range has to
   survive a reload and a pasted link, and because the aggregation happens on
   the server. Nothing is refetched in the browser; `router.replace` re-runs the
   Server Component that owns the query.

   `scroll: false` because the control sits several hundred pixels down the
   page and jumping to the top on every click loses the thing you just changed.

   The pending state is REAL: the transition is genuinely still running while
   Postgres re-aggregates, and `aria-busy` says so instead of the control
   pretending the new range is already drawn. */

export type RangeKey = "30" | "90" | "all";

export function RangeTabs({ value, allLabel }: { value: RangeKey; allLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div aria-busy={pending} className={pending ? "opacity-60" : undefined}>
      <Segmented<RangeKey>
        name="usage-range"
        size="sm"
        ariaLabel="Range for the credits-over-time chart"
        value={value}
        options={[
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
          { value: "all", label: allLabel },
        ]}
        onChange={(next) => {
          startTransition(() => {
            router.replace(next === "30" ? "/dashboard/usage" : `/dashboard/usage?range=${next}`, {
              scroll: false,
            });
          });
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

/* A plain <a>, not a fetch and not next/link: the route answers with a
   Content-Disposition attachment and a streamed body, so the browser's own
   download machinery is exactly the right thing. A client-side fetch would
   buffer the whole account in memory to hand it straight back to the browser.

   The cooldown mirrors the route's own one-per-minute throttle
   (app/api/account/export/route.ts) so an impatient second click is greyed out
   here rather than answered with a 429 the user cannot see — a failed download
   with no visible error is the worst version of this. */

const COOLDOWN_MS = 60_000;

export default function DataExportButton() {
  const [cooling, setCooling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (cooling) {
    return (
      <span
        aria-live="polite"
        className={buttonClass({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-50" })}
      >
        <Download className="size-4" aria-hidden />
        Preparing your download…
      </span>
    );
  }

  return (
    <a
      href="/api/account/export"
      className={buttonClass({ variant: "secondary", size: "sm" })}
      onClick={() => {
        setCooling(true);
        timer.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
      }}
    >
      <Download className="size-4" aria-hidden />
      Download my data (JSON)
    </a>
  );
}

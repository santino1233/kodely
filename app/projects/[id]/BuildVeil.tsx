"use client";

import { Mark } from "@/components/marketing/Logo";
import { AIProgress } from "@/components/ui/AIProgress";
import { buildSteps, type BuildRun } from "./build-steps";

// The treatment over the preview while Kodely is changing an EXISTING site.
//
// The site underneath stays visible and only mildly blurred (`k-preview-busy`
// is 2.5px, and globals.css drops the blur entirely under
// prefers-reduced-motion). That is the whole point: the customer has to keep
// recognising their own site under the veil, or the moment reads as "it has
// been replaced" rather than "it is being edited". A full-cover overlay is
// reserved for the FIRST build, where there is genuinely nothing underneath —
// see BuildingOverlay.
//
// aria-hidden, and deliberately: AIProgress carries its own aria-live region,
// the chat panel renders the same list at the same time, and two live regions
// holding identical text makes a screen reader read every step twice. The chat
// copy is the announcer because it is present in every view; this one is the
// picture.

export default function BuildVeil({ run }: { run: BuildRun }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6"
    >
      {/* A scrim rather than an opaque panel: it lifts the card off the site
          without hiding it. */}
      <div className="absolute inset-0 bg-canvas/45" />
      <div className="k-msg-in relative w-full max-w-xs rounded-xl border border-hair bg-surface/95 p-4 shadow-e3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="kodely-breathe motion-reduce:animate-none">
            <Mark size={22} />
          </span>
          <span className="k-h2 text-ink">Kodely is working</span>
        </div>
        <AIProgress className="mt-3" steps={buildSteps(run)} />
      </div>
    </div>
  );
}

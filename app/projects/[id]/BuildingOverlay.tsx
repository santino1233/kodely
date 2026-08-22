"use client";

import { Mark } from "@/components/marketing/Logo";
import { AIProgress } from "@/components/ui/AIProgress";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildSteps, type BuildRun } from "./build-steps";

// What the user looks at for the 60–90 seconds a FIRST build takes. Unlike an
// edit there is nothing underneath it — no previous version of the site exists
// — so this covers the pane outright instead of veiling it (see BuildVeil for
// the edit case).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS STILL HERE, given /dashboard/new runs first builds now
// ─────────────────────────────────────────────────────────────────────────────
// The create flow (app/(portal)/dashboard/new) holds the whole first build on
// its own screen and only calls router.push("/projects/<id>") once the stream
// has said `done` — it has to, because navigating mid-stream closes the
// response body, which fires cancel() on the route's ReadableStream and aborts
// the build server-side. So a customer who arrives that way arrives at a
// FINISHED site and never sees this component.
//
// That is not the only door. lib/pending-prompt.ts's destinationAfterAuth()
// still sends someone straight to /projects/<id> with their prompt in
// sessionStorage after login or signup, and Editor.tsx fires it on mount — so
// every homepage composer, template card and wizard hand-off that goes through
// the auth wall runs its first build HERE, in the builder, with an empty
// project underneath. Deleting this would leave those paths staring at the
// "No site here yet" empty state for ninety seconds while a build they cannot
// see runs behind it.
//
// The gate is `isFirstBuildRun` at the bottom of Editor.tsx, which reads
// `run.kind` — fixed when the build starts — rather than anything that changes
// while it runs. If destinationAfterAuth() is ever changed to route through
// /dashboard/new like everything else, this component and that gate go
// together; until then it is load-bearing, not leftover.
//
// Two jobs, in this order of importance:
//  1. Say what is happening, truthfully. Every step comes from a real event on
//     the generate stream — see build-steps.ts for the full vocabulary and the
//     exact mapping. There is no timed script anywhere in this feature.
//  2. Make the wait feel like craft rather than a hang. The skeleton resolves
//     in the shape of an actual page, so the shape of what is coming is
//     legible before any of it exists.
//
// No progress BAR anywhere: the build is an agent loop of unknown length, we
// genuinely cannot know what fraction is done, and a bar that stalls at 80% is
// the exact thing that makes people reload.
//
// aria-hidden on everything: AIProgress has its own aria-live region and the
// chat column renders the same list at the same time. Two regions holding
// identical text made a screen reader announce every step twice — measured, in
// the browser. The chat copy is the announcer; this is the picture.

export default function BuildingOverlay({ run }: { run: BuildRun }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 overflow-y-auto bg-inset p-8">
      <div className="relative w-full max-w-sm">
        {/* One ambient wash, on the one panel in this view that earns it. */}
        <span className="k-wash rounded-xl" aria-hidden />
        <div className="relative rounded-xl border border-hair bg-surface p-5 shadow-e2">
          <div className="flex items-center gap-3">
            <span className="kodely-breathe motion-reduce:animate-none">
              <Mark size={32} />
            </span>
            <div className="min-w-0">
              <p className="k-h2 text-ink">Building your site</p>
              <p className="text-[0.8125rem] text-ink-2">
                This usually takes a minute or two.
              </p>
            </div>
          </div>
          <div aria-hidden>
            <AIProgress className="mt-4" steps={buildSteps(run)} />
          </div>
        </div>
      </div>

      {/* A page taking shape. Deliberately generic — nav, hero, three cards —
          because guessing the actual layout would mean showing something the
          finished site then contradicts. */}
      <div className="flex w-full max-w-md flex-col gap-4 opacity-70" aria-hidden>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-2.5 w-10" delay={100} />
            <Skeleton className="h-2.5 w-10" delay={150} />
            <Skeleton className="h-2.5 w-10" delay={200} />
          </div>
        </div>
        <Skeleton className="h-24 w-full" delay={300} rounded="rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-3/4" delay={450} />
          <Skeleton className="h-3 w-1/2" delay={500} />
        </div>
        <Skeleton className="h-7 w-28" delay={600} />
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Skeleton className="h-16" delay={700} rounded="rounded-lg" />
          <Skeleton className="h-16" delay={780} rounded="rounded-lg" />
          <Skeleton className="h-16" delay={860} rounded="rounded-lg" />
        </div>
      </div>
    </div>
  );
}

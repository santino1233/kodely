"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// ── First-run panel (presentation + dismissal) ─────────────────────────────
//
// The three rows here are the activation funnel from lib/events.ts, minus the
// signup step you already completed to be looking at this: project.created →
// build.succeeded → project.published. The North Star is the LAST one, so the
// checklist deliberately keeps going after the first successful build rather
// than congratulating someone for stopping halfway.
//
// Progressive, never blocking. This is an inline card above the project list:
// no modal, no tour, no focus trap, nothing between anyone and the raw prompt
// box. Every step is a description of state plus an optional shortcut — none
// of them is a gate.
//
// Visibility is decided in two places for two different reasons:
//   • "are they past this?" is DERIVED, by the server component that renders
//     this (FirstRunChecklist) — a published project makes the panel vanish
//     permanently, because that fact lives in the database already.
//   • "I don't want to see this" is a local UI preference and lives in
//     localStorage. It is not a fact about the account, it can't earn a
//     schema field, and losing it on another device is harmless.

const DISMISS_KEY = "kodely:first-run-dismissed";

/* Inline links inside the step copy. `k-focus` is the product's ONE focus
   treatment (docs/design-system.md) — this panel used to carry a private
   focus-ring constant that also set `outline-none`, which is the one thing the
   shared utility exists to stop. */
const INLINE_LINK =
  "k-focus rounded-xs font-medium text-brand underline underline-offset-2 hover:no-underline";

// localStorage read as an external store, rather than state synced in an
// effect. Two things fall out of it for free: the server snapshot is "already
// dismissed", so nothing is ever server-rendered and then yanked away a frame
// later; and dismissing in one tab hides it in the others.
const dismissListeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  dismissListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    dismissListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Set when the button is pressed, so dismissing still works on this page view
 * even where localStorage is unavailable (private mode, storage disabled, a
 * full quota). There it simply doesn't survive a reload, which is a far better
 * failure than a card that cannot be closed.
 */
let dismissedThisSession = false;

function readDismissed(): boolean {
  if (dismissedThisSession) return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Server/hydration snapshot: hidden until the real answer is known. */
function readDismissedOnServer(): boolean {
  return true;
}

function writeDismissed() {
  dismissedThisSession = true;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
  for (const onChange of dismissListeners) onChange();
}

/**
 * Project names run to 80 characters (the cap in app/api/projects/route.ts).
 *
 * Clipped in JS rather than with `truncate`, because `ButtonLink` wraps its
 * children in its own span: the CSS approach needs `min-w-0` on that
 * intermediate flex item, which a caller cannot reach. `buttonClass` also sets
 * `whitespace-nowrap`, so an unclipped 80-character name would push this
 * button past the edge of a 390px phone — the exact horizontal-scroll bug the
 * design system says the page body must never have.
 */
const NAME_CLIP = 28;

function clipName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > NAME_CLIP ? `${trimmed.slice(0, NAME_CLIP - 1)}…` : trimmed;
}

export type FirstRunPanelProps = {
  /** They have at least one project (the signup seed counts — it is a real project). */
  hasProject: boolean;
  /** At least one build has SUCCEEDED across all their projects. */
  hasBuild: boolean;
  /** Most recently touched project, for the "open it" shortcut. */
  openProject: { id: string; name: string } | null;
  /** SIGNUP_GRANT, passed in rather than hardcoded so it can never drift. */
  grant: number;
  /** Derived from MICROS_PER_CREDIT — how many credits make one dollar. */
  creditsPerDollar: number;
  /** Size of the starter-prompt gallery at /templates. */
  templateCount: number;
};

type Step = {
  id: string;
  title: string;
  done: boolean;
  /** Shown only while the step is outstanding. */
  body: ReactNode;
};

export default function FirstRunPanel({
  hasProject,
  hasBuild,
  openProject,
  grant,
  creditsPerDollar,
  templateCount,
}: FirstRunPanelProps) {
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, readDismissedOnServer);
  const [creditsOpen, setCreditsOpen] = useState(false);

  if (dismissed) return null;

  const steps: Step[] = [
    {
      id: "create",
      title: "Create a site",
      done: hasProject,
      /* NAMES A BUTTON THAT IS ACTUALLY ON SCREEN. This used to say “New
         site”, which was the secondary blank-project button — that has been
         removed, and “Create Website” is now the only way in from here. Copy
         that points at a control the customer cannot find is worse than no
         copy at all, so this string and the dashboard's button have to be
         changed together. */
      body: (
        <>
          Press <strong className="font-medium text-ink">Create Website</strong> at the top of
          this page and say what you want in the box on the next screen. Every site starts as a
          real React app, not a mockup.
        </>
      ),
    },
    {
      id: "build",
      title: "Describe it, and build it",
      done: hasBuild,
      body: (
        <>
          Open a site and type what you want in the box at the bottom — plain English, as
          specific as you can manage. Not sure what to type?{" "}
          {/* The IN-SHELL gallery, not the public /templates marketing page:
              this panel only ever renders for a signed-in customer inside
              AppShell, and /templates would drop them out of the product into
              a page with its own marketing nav. */}
          <Link href="/dashboard/templates" className={INLINE_LINK}>
            Start from one of <span className="k-num">{templateCount}</span> written prompts
          </Link>
          . Already typed something rough? Press{" "}
          <strong className="font-medium">Enhance</strong> next to the box — it expands your
          line into a fuller spec you can read and edit first, and it costs no credits.
        </>
      ),
    },
    {
      id: "publish",
      title: "Publish it",
      done: false,
      body: (
        <>
          When it looks right, hit Publish on the site’s page. That is the point it gets a
          real address you can send to someone.
        </>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card as="section" aria-labelledby="first-run-heading" className="text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="first-run-heading" className="k-h2 text-ink">
            Getting started
          </h2>
          <p className="mt-1 text-xs text-ink-2">
            <span className="k-num">
              {doneCount} of {steps.length}
            </span>{" "}
            done · your first published site is the finish line
          </p>
        </div>
        <IconButton
          label="Dismiss getting started"
          variant="ghost"
          size="sm"
          className="-mt-1 -mr-1"
          onClick={writeDismissed}
        >
          <X size={16} aria-hidden />
        </IconButton>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-2.5">
            {/* Same marker vocabulary as AIProgress's StepIcon — `bg-ok-tint`
                for done, `border-line-strong` for the outstanding step, which
                is exactly what the design system reserves that border for.
                Not AIProgress itself: that component is contracted to the AI
                build signal, and this is an account checklist. */}
            <span
              aria-hidden
              className={[
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                step.done ? "bg-ok-tint text-ok" : "border border-line-strong",
              ].join(" ")}
            >
              {step.done && <Check size={11} strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className={step.done ? "text-ink-3" : "font-medium text-ink"}>
                {step.title}
                {step.done && <span className="sr-only"> — done</span>}
              </p>
              {!step.done && (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{step.body}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* The shortcut only exists once there is something to open, and only
          while building is still the outstanding step — after that it would
          just be a second, worse copy of the project list below.
          SECONDARY on purpose: the dashboard's one `primary` is "Create
          Website" and the design system allows exactly one per view. */}
      {hasProject && !hasBuild && openProject && (
        <ButtonLink
          href={`/projects/${openProject.id}`}
          variant="secondary"
          size="sm"
          className="mt-4"
          iconRight={<span aria-hidden>→</span>}
          // The visible label is clipped, so the full name still has to reach
          // a screen reader and a hover.
          aria-label={`Open ${openProject.name}`}
          title={openProject.name}
        >
          Open {clipName(openProject.name)}
        </ButtonLink>
      )}

      <div className="mt-5 border-t border-hair pt-4">
        <button
          type="button"
          onClick={() => setCreditsOpen((v) => !v)}
          aria-expanded={creditsOpen}
          aria-controls="first-run-credits"
          className="k-focus rounded-xs text-xs text-ink-2 underline underline-offset-2 hover:text-ink hover:no-underline"
        >
          {creditsOpen ? "Hide" : "What is a credit?"}
        </button>

        {/* Kept mounted so aria-controls always points at a real element. */}
        <div id="first-run-credits" hidden={!creditsOpen}>
          <CreditPrimer grant={grant} creditsPerDollar={creditsPerDollar} />
        </div>
      </div>
    </Card>
  );
}

// ── The credits explanation ────────────────────────────────────────────────
//
// Everything here is a fact taken from lib/credits.ts, and one thing is
// deliberately absent: a price per build. Our two real measurements are 144
// and 472 credits — a 3x spread — and estimateCredits' own comment says two
// data points are not a distribution. Quoting an average would be inventing
// precision we do not have, on the one topic (bill shock) where this product
// claims to be more honest than the category. So the answer to "what will
// this cost me?" points at the meter, which is computed from that person's
// own build history, rather than at a number made up here.
function CreditPrimer({ grant, creditsPerDollar }: { grant: number; creditsPerDollar: number }) {
  return (
    <dl className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-ink-2">
      <div>
        <dt className="font-medium text-ink">A credit is real spend</dt>
        <dd>
          One credit is a fixed amount of actual model spend —{" "}
          <span className="k-num">{creditsPerDollar}</span> credits is $1. It is not a made-up
          point system, and it is not per-message.
        </dd>
      </div>
      <div>
        <dt className="font-medium text-ink">
          You start with <span className="k-num">{grant}</span>
        </dt>
        {/* POINTS AT A THING THAT EXISTS. This used to say "the meter at the
            top of this page", which described a hero stat that no longer
            phrases the balance as builds. The credits card in the rail is the
            one place that does, and it is on every screen. */}
        <dd>
          Enough to get a first site built and iterate on it. How far it goes after that
          depends on how much you ask for — a bigger site costs more than a small one, so we
          do not quote a flat price per build. The credits card in the sidebar estimates how
          many builds you have left from your own history.
        </dd>
      </div>
      <div>
        <dt className="font-medium text-ink">Failed builds are free</dt>
        <dd>
          You are charged only for a build that succeeds. A build that breaks, or one you
          stop halfway, costs you nothing.
        </dd>
      </div>
      <div>
        <dt className="font-medium text-ink">You can cap your spend</dt>
        <dd>
          Set a ceiling for a rolling 30 days in{" "}
          <Link href="/settings/credits" className={INLINE_LINK}>
            Settings
          </Link>{" "}
          and a long session cannot run past it.
        </dd>
      </div>
    </dl>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { SkipLink } from "@/components/marketing/SkipLink";
import {
  DEGRADED_MIN_SUCCESS,
  MEDIUM_BAND_MAX,
  OPERATIONAL_MIN_SUCCESS,
  SMALL_BAND_MAX,
  loadStatus,
  worstOf,
  type ComponentState,
  type GenerationStatus,
  type SampleBand,
} from "./status";

// The PUBLIC status page.
//
// Unauthenticated and indexable, so the whole design constraint is what it
// must NOT say. Everything rendered below is either static prose written here
// or one of the bounded values from ./status.ts — there is no code path that
// puts a database string, an error message, an environment variable value, a
// hostname, a customer name or a cost figure on this page. A status page that
// accidentally reports “SMTP not configured” has told an attacker which
// feature to probe and told a customer something they cannot act on; a status
// page that echoes a build error has published someone’s source code.
//
// The second constraint is honesty. There is no uptime monitoring, no
// synthetic prober, no alerting and no on-call rotation behind this product
// today. Every state here is computed inside the application at the moment
// you load the page. Rather than dress that up, the page explains it — and
// where there is no signal it says “unknown”, which is the one word a status
// page is usually least willing to print.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status — Kodely",
  description:
    "Current state of the Kodely app, site generation, and published-site serving, with an honest account of what is and is not measured.",
};

export default async function StatusPage() {
  // force-dynamic already (above), so the session read adds no route cost and
  // the nav paints correctly on the first response instead of after hydration.
  const user = await getCurrentUser();
  const status = await loadStatus();
  const overall = worstOf([status.app, status.generation.state, status.serving]);

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <SkipLink />
      <Aura />
      <MarketingNav signedIn={Boolean(user)} />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 sm:pt-44"
      >
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          Service status
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Kodely status</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Checked when you loaded this page, at{" "}
          <time dateTime={status.checkedAt.toISOString()} className="tabular-nums">
            {formatStamp(status.checkedAt)}
          </time>
          . Reload to check again — nothing here is cached, and nothing here is stored.
        </p>

        <OverallBanner state={overall} />

        <h2 className="mt-12 text-lg font-semibold tracking-tight">Components</h2>
        <ul className="mt-4 space-y-4">
          <ComponentCard
            name="The Kodely app"
            state={status.app}
            checked="You are reading a page that the application rendered, so the web tier answered at least one request — this one."
            notChecked="Whether it answered anyone else, from any other network, in the seconds either side of this one. This is a self-report, not a probe."
          />
          <ComponentCard
            name="Site generation"
            state={status.generation.state}
            checked={generationChecked(status.generation)}
            notChecked="Whether a generation would succeed for you right now. This is the recent record, not a live test — nothing on this page starts a build."
          />
          <ComponentCard
            name="Published-site serving"
            state={status.serving}
            checked={
              status.serving === "operational"
                ? "The origin can read the records a published site is served from — the same two reads the site route makes on every request."
                : "The records a published site is served from could not be read when you loaded this page. Published sites are likely to be failing."
            }
            notChecked="DNS, TLS and the CDN in front of the origin. None of them are on this code path, and nothing here would notice a fault in them."
          />
        </ul>

        <h2 className="mt-12 text-lg font-semibold tracking-tight">What each state means</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          These words are defined here rather than borrowed, because on most status pages they are
          not defined anywhere.
        </p>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed">
          <Definition term="Operational" state="operational">
            A check ran when you loaded this page and passed. For site generation that means at
            least {OPERATIONAL_MIN_SUCCESS}% of recently finished generations produced a working
            site. It does not mean anything is being watched between page loads.
          </Definition>
          <Definition term="Degraded" state="degraded">
            A check ran and the result is worse than we consider healthy but is not a total
            failure — for site generation, a success rate between {DEGRADED_MIN_SUCCESS}% and{" "}
            {OPERATIONAL_MIN_SUCCESS}%.
          </Definition>
          <Definition term="Outage" state="outage">
            A check ran and failed, or fewer than {DEGRADED_MIN_SUCCESS}% of recently finished
            generations produced a working site.
          </Definition>
          <Definition term="Unknown" state="unknown">
            There is no signal — nothing recent to measure, or the check itself could not run.
            Unknown is never rounded up to operational. If this page cannot tell, it says it
            cannot tell.
          </Definition>
        </dl>

        <h2 className="mt-12 text-lg font-semibold tracking-tight">
          What this page does not tell you
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <Caveat>
            <strong className="font-medium text-neutral-900 dark:text-neutral-50">
              Nothing is monitored between page loads.
            </strong>{" "}
            There is no uptime monitor, no synthetic checker and no alerting behind this page
            today. Every state above was computed a moment ago, inside the application, because
            you asked for it. An outage that started and ended between two visits leaves no trace
            here.
          </Caveat>
          <Caveat>
            <strong className="font-medium text-neutral-900 dark:text-neutral-50">
              This page runs inside the thing it is reporting on.
            </strong>{" "}
            If the application is completely down, this page is down with it. A status page that
            will not load is itself a signal — and it is the only signal this arrangement can give
            you for a total outage.
          </Caveat>
          <Caveat>
            <strong className="font-medium text-neutral-900 dark:text-neutral-50">
              There is no incident history.
            </strong>{" "}
            Nothing records past status, so there is none to show. A history of green squares that
            was never actually measured would be worse than an empty section.
          </Caveat>
          <Caveat>
            <strong className="font-medium text-neutral-900 dark:text-neutral-50">
              Only three components are covered.
            </strong>{" "}
            Sign-in, email and payments are not measured here and are not implied by anything
            above. Their absence from this page means we have no honest measurement of them, not
            that they are healthy.
          </Caveat>
          <Caveat>
            <strong className="font-medium text-neutral-900 dark:text-neutral-50">
              Detail is withheld on purpose.
            </strong>{" "}
            This page carries no error text, no configuration state and no figures about
            customers, sites or spend. Build errors in this system can contain fragments of a
            customer’s source code, and a database error can echo a connection string, so neither
            is read on this code path at all.
          </Caveat>
        </ul>

        <h2 className="mt-12 text-lg font-semibold tracking-tight">Something looks wrong?</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          If your experience disagrees with this page, your experience is the more reliable of the
          two —{" "}
          <Link
            href="/contact"
            className="font-medium text-neutral-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-50"
          >
            tell us what happened
          </Link>
          . Include roughly when it happened and what you were doing; that is what makes it
          findable in the logs.
        </p>
      </main>

      <MarketingFooter signedIn={Boolean(user)} />
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────

const BANNER_HEADLINE: Record<ComponentState, string> = {
  operational: "All checked components are operational",
  degraded: "A checked component is degraded",
  outage: "A checked component is failing",
  unknown: "Some components cannot be determined right now",
};

const BANNER_BODY: Record<ComponentState, string> = {
  operational:
    "Every check on this page ran and passed just now. That is a statement about this moment and these three components, and about nothing else.",
  degraded:
    "At least one component is measurably worse than healthy. Details are below; the cause is not published here.",
  outage:
    "At least one check failed outright. Details are below; the cause is not published here.",
  unknown:
    "At least one component has no signal to report — there was nothing recent to measure, or the check could not run. It is shown as unknown rather than assumed to be fine.",
};

function OverallBanner({ state }: { state: ComponentState }) {
  return (
    <section
      aria-label="Overall status"
      className={`mt-8 rounded-2xl border p-5 ${BORDER[state]} ${TINT[state]}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <StateDot state={state} />
        <h2 className="text-base font-semibold tracking-tight">{BANNER_HEADLINE[state]}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {BANNER_BODY[state]}
      </p>
    </section>
  );
}

// ── Components list ───────────────────────────────────────────────────────

function ComponentCard({
  name,
  state,
  checked,
  notChecked,
}: {
  name: string;
  state: ComponentState;
  checked: ReactNode;
  notChecked: ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold">{name}</h3>
        <StateBadge state={state} />
      </div>
      <dl className="mt-3 space-y-2 text-sm leading-relaxed">
        <div>
          <dt className="inline font-medium">Checked: </dt>
          <dd className="inline text-neutral-600 dark:text-neutral-400">{checked}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Not checked: </dt>
          <dd className="inline text-neutral-600 dark:text-neutral-400">{notChecked}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * The generation card’s “Checked” sentence, assembled from bounded values
 * only. Every branch here is a complete sentence written in this file — none
 * of it is interpolated from the database beyond one rounded percentage.
 */
function generationChecked(g: GenerationStatus): string {
  if (!g.measured) {
    return "Nothing. The build records could not be read when you loaded this page, so the recent success rate is unavailable and we are not guessing at it.";
  }
  if (g.successRate === null) {
    return "Nothing to measure: no generation finished in the last 7 days, so there is no recent success rate to report.";
  }

  const window = g.windowHours >= 168 ? "7 days" : "24 hours";
  const widened = g.widened
    ? " No generation finished in the last 24 hours, so this covers the last 7 days instead."
    : "";

  return `Of the generations that finished in the last ${window}, ${g.successRate}% produced a working site. That is ${BAND_PHRASE[g.sample]}.${widened}${
    g.sample === "small"
      ? " At that sample size a single failure moves the number several points, so treat it as an indication rather than a rate."
      : ""
  }`;
}

const BAND_PHRASE: Record<SampleBand, string> = {
  none: "no completed generations",
  small: `based on fewer than ${SMALL_BAND_MAX} completed generations`,
  medium: `based on between ${SMALL_BAND_MAX} and ${MEDIUM_BAND_MAX} completed generations`,
  large: `based on ${MEDIUM_BAND_MAX} or more completed generations`,
};

// ── State vocabulary ──────────────────────────────────────────────────────
//
// State is carried by the WORD first. The dot and the tint reinforce it and
// are never the only thing distinguishing two states, so the page still reads
// correctly in monochrome, and the text colours are the darker/lighter ends of
// each ramp so they clear 4.5:1 on both the light and dark surfaces. Nothing
// here puts new text on the brand gradient, which is a known contrast failure.

const STATE_WORD: Record<ComponentState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  unknown: "Unknown",
};

const DOT: Record<ComponentState, string> = {
  operational: "bg-emerald-600 dark:bg-emerald-400",
  degraded: "bg-amber-600 dark:bg-amber-400",
  outage: "bg-red-700 dark:bg-red-400",
  unknown: "bg-neutral-500 dark:bg-neutral-400",
};

const TEXT: Record<ComponentState, string> = {
  operational: "text-emerald-800 dark:text-emerald-300",
  degraded: "text-amber-800 dark:text-amber-300",
  outage: "text-red-800 dark:text-red-300",
  unknown: "text-neutral-700 dark:text-neutral-300",
};

const BORDER: Record<ComponentState, string> = {
  operational: "border-emerald-600/30 dark:border-emerald-400/30",
  degraded: "border-amber-600/40 dark:border-amber-400/40",
  outage: "border-red-700/40 dark:border-red-400/40",
  unknown: "border-neutral-300 dark:border-neutral-700",
};

const TINT: Record<ComponentState, string> = {
  operational: "bg-emerald-500/5",
  degraded: "bg-amber-500/5",
  outage: "bg-red-500/5",
  unknown: "bg-neutral-500/5",
};

function StateDot({ state }: { state: ComponentState }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${DOT[state]}`} />;
}

function StateBadge({ state }: { state: ComponentState }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${BORDER[state]} ${TINT[state]} ${TEXT[state]}`}
    >
      <StateDot state={state} />
      {STATE_WORD[state]}
    </span>
  );
}

function Definition({
  term,
  state,
  children,
}: {
  term: string;
  state: ComponentState;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 font-medium">
        <StateDot state={state} />
        {term}
      </dt>
      <dd className="mt-1 text-neutral-600 dark:text-neutral-400">{children}</dd>
    </div>
  );
}

function Caveat({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">{children}</li>
  );
}

/** UTC, second-free, and rendered on the server so it cannot drift on hydration. */
function formatStamp(d: Date): string {
  return `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

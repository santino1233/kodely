"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import {
  EMPTY_FACTS,
  EMPTY_REFERENCE,
  extractFactsFromPaste,
  factCount,
  factRows,
  hasReference,
  MAX_PASTE_CHARS,
  ownershipLine,
  renderFactsBlock,
  renderReferenceBlock,
  SOURCE_LABELS,
  validateImportUrl,
  type FactKey,
  type ReferenceStyle,
  type SiteFacts,
} from "@/lib/site-import";

/**
 * Step 3 — the one optional screen, holding both site inputs.
 *
 * ## Why one screen and not two
 *
 * Most first-time visitors have neither of these. Two consecutive screens they
 * skip is two chances to abandon; one screen with two empty fields and a
 * prominent Skip is one. The screen's own copy has to set expectations
 * honestly, because the two fields are treated completely differently and the
 * difference is the whole point.
 *
 * ## The line this screen draws, out loud
 *
 * From YOUR site we take facts — name, address, phone, hours, services, and
 * your own words. They are yours.
 *
 * From a site you LIKE we take colours, section order and corner style. Not a
 * headline, not a sentence, not an image, not a logo. The struct in
 * lib/site-import.ts makes that structurally true (a `ReferenceStyle` has
 * nowhere to put a sentence) and the copy below says it in plain English,
 * because a guarantee the user cannot see is a guarantee they cannot rely on.
 *
 * ## Where the logo went
 *
 * It is not here. lib/brand-kit.ts already solves the logo properly — SVG
 * sanitising, raster caps sized against real token cost, a palette derived from
 * the artwork — and it lives in the project's brand-kit panel where it can be
 * injected out of band instead of through the model's context. Duplicating a
 * worse version of it on a marketing page would be a promise this screen cannot
 * keep, so the screen points at the real thing instead.
 *
 * ## Signed out
 *
 * The paste box works with no account and no server round trip: parsing runs in
 * this component, via `extractFactsFromPaste`. The URL fields are only rendered
 * when the caller says both that the user is signed in and that the isolated
 * egress path exists, because an affordance that 401s or 503s on click is worse
 * than no affordance at all.
 */

export type ImportState = {
  facts: SiteFacts;
  /** Whatever is in the paste box, kept so Back/Next does not lose it. */
  paste: string;
  /** The user's assertion that the current site is theirs, for the URL path. */
  owned: boolean;
  reference: ReferenceStyle;
  /** Facts the user unticked. They must not reach the build. */
  excluded: FactKey[];
};

export const EMPTY_IMPORT: ImportState = {
  facts: EMPTY_FACTS,
  paste: "",
  owned: false,
  reference: EMPTY_REFERENCE,
  excluded: [],
};

export function hasImport(state: ImportState): boolean {
  return factCount(state.facts) > 0 || hasReference(state.reference);
}

/** True once anything imported is actually going into the prompt. */
export function hasImportedFacts(state: ImportState): boolean {
  return factRows(state.facts).some((r) => !state.excluded.includes(r.key));
}

/**
 * The text step 3 contributes to the assembled prompt.
 *
 * Assembled here rather than in lib/wizard.ts's `assemblePrompt` because that
 * function is out of this change's scope, and because keeping the import
 * fragment separable is useful in its own right: the review step needs to know
 * whether the prompt carries imported content, and a caller that can ask for
 * the fragment on its own can answer that without parsing a string.
 */
export function importFragment(state: ImportState, hasChosenLook: boolean): string {
  const parts: string[] = [];
  const facts = renderFactsBlock(state.facts, state.excluded);
  if (facts) {
    parts.push(facts);
    if (state.owned && state.facts.origin) parts.push(ownershipLine(state.facts.origin));
  }
  const reference = renderReferenceBlock(state.reference, hasChosenLook);
  if (reference) parts.push(reference);
  return parts.join("\n\n");
}

export function ImportStep({
  headingRef,
  state,
  onChange,
  signedIn,
  urlImport,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  state: ImportState;
  onChange: (next: ImportState) => void;
  signedIn: boolean;
  /** Server-side: is the isolated egress path switched on? */
  urlImport: boolean;
}) {
  const showUrl = signedIn && urlImport;

  return (
    <section className="mt-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
      >
        Anything you already have?
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        All optional, and most people skip it. Two different things, treated two very different
        ways — read the note under each one.
      </p>

      <CurrentSite state={state} onChange={onChange} showUrl={showUrl} />
      <ReferenceSite state={state} onChange={onChange} showUrl={showUrl} />

      <p className="mt-7 border-t border-black/10 pt-5 text-xs leading-relaxed text-neutral-500 dark:border-white/10 dark:text-neutral-400">
        Your logo isn&apos;t here on purpose. It goes in the project&apos;s brand kit once the site
        exists, where Kodely can clean the file up and drop it straight into the page instead of
        describing it to the model.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Your current site — facts
// ---------------------------------------------------------------------------

function CurrentSite({
  state,
  onChange,
  showUrl,
}: {
  state: ImportState;
  onChange: (next: ImportState) => void;
  showUrl: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = factRows(state.facts);

  async function importUrl() {
    if (busy) return;
    const check = validateImportUrl(url);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = await api<{ facts: SiteFacts }>("/api/import/site", {
        method: "POST",
        body: JSON.stringify({ url: check.url.toString(), kind: "current", owned: true }),
      });
      onChange({ ...state, facts: body.facts, excluded: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Paste the text instead.");
    } finally {
      setBusy(false);
    }
  }

  function applyPaste(text: string) {
    // Parsed in the browser. No network, no account, no model — which is what
    // keeps the signed-out wizard at zero server round trips.
    onChange({
      ...state,
      paste: text,
      facts: text.trim() ? extractFactsFromPaste(text) : EMPTY_FACTS,
      owned: false,
      excluded: [],
    });
  }

  function toggle(key: FactKey) {
    const excluded = state.excluded.includes(key)
      ? state.excluded.filter((k) => k !== key)
      : [...state.excluded, key];
    onChange({ ...state, excluded });
  }

  return (
    <fieldset className="mt-7 rounded-xl border border-black/10 p-5 dark:border-white/10">
      <legend className="px-2 text-sm font-medium">Your current site</legend>
      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Kodely never invents a phone number or an address — it leaves{" "}
        <span className="font-mono text-xs">[your phone number]</span> instead. This is how those
        get filled in with the real thing: your name, address, hours, services and your own words,
        taken from a site that is already yours.
      </p>

      {showUrl ? (
        <div className="mt-4">
          <label htmlFor="import-current-url" className="block text-sm font-medium">
            Address of your site
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="import-current-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="bloompilates.co.uk"
              className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
            />
            <button
              type="button"
              onClick={importUrl}
              disabled={busy || !url.trim() || !state.owned}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {busy && <Loader2 size={14} aria-hidden className="animate-spin" />}
              {busy ? "Reading…" : "Read it"}
            </button>
          </div>

          {/* An assertion the user makes, not a checkbox nobody reads: we
              cannot verify ownership cheaply, so the honest design is to ask
              plainly and record the answer with the URL and the time. It gates
              the button rather than sitting beside it. */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={state.owned}
              onChange={(e) => onChange({ ...state, owned: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-neutral-900 dark:accent-white"
            />
            <span>
              This site is mine, or I have the right to use its content. Kodely fetches one page,
              reads it for the details above, and keeps nothing else.
            </span>
          </label>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-black/[0.03] px-3.5 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-400">
          Reading a site by its address needs an account, and it is off by default while the
          fetcher runs from the same machine as everything else. Pasting works right now, needs no
          account, and never leaves your browser.
        </p>
      )}

      <div className="mt-5">
        <label htmlFor="import-paste" className="block text-sm font-medium">
          Or paste anything from it{" "}
          <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
        </label>
        <textarea
          id="import-paste"
          value={state.paste}
          onChange={(e) => applyPaste(e.target.value.slice(0, MAX_PASTE_CHARS))}
          rows={5}
          maxLength={MAX_PASTE_CHARS}
          placeholder="Your about text, your services, your opening hours — whatever you have."
          className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3.5 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
        />
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {state.paste.length}/{MAX_PASTE_CHARS} characters. Parsed here in your browser — nothing
          is sent anywhere.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-5 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-xs font-medium">
            Found {rows.length} {rows.length === 1 ? "detail" : "details"} — untick anything wrong
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Only ticked details go into the build, and only these. Everything else stays a bracket
            for you to fill in later.
          </p>
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li key={row.key}>
                <label className="flex cursor-pointer items-start gap-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={!state.excluded.includes(row.key)}
                    onChange={() => toggle(row.key)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-neutral-900 dark:accent-white"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{row.label}: </span>
                    <span className="text-neutral-600 dark:text-neutral-400">{row.value}</span>{" "}
                    <span className="whitespace-nowrap text-neutral-400 dark:text-neutral-500">
                      (from {SOURCE_LABELS[row.source]})
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// A site you like — feel only
// ---------------------------------------------------------------------------

function ReferenceSite({
  state,
  onChange,
  showUrl,
}: {
  state: ImportState;
  onChange: (next: ImportState) => void;
  showUrl: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = state.reference;

  async function importUrl() {
    if (busy) return;
    const check = validateImportUrl(url);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = await api<{ reference: ReferenceStyle }>("/api/import/site", {
        method: "POST",
        body: JSON.stringify({ url: check.url.toString(), kind: "reference" }),
      });
      onChange({ ...state, reference: body.reference });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-6 rounded-xl border border-black/10 p-5 dark:border-white/10">
      <legend className="px-2 text-sm font-medium">A site you like the look of</legend>

      {/* Stated before the field, not in small print underneath it. The struct
          cannot carry copy, and the person typing the URL should know that
          before they type it. */}
      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Kodely takes three things from it: the colours, the order the sections come in, and how
        rounded the corners are. That is the whole list.
      </p>
      <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        <ShieldCheck size={15} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <span>
          No text, no headlines, no images, no logo. Your copy gets written from scratch for your
          business. Copying someone else&apos;s words onto a site we host is their complaint and our
          problem, so the import has nowhere to put them.
        </span>
      </p>

      {showUrl ? (
        <div className="mt-4">
          <label htmlFor="import-reference-url" className="block text-sm font-medium">
            Address of the site
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="import-reference-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="somesite.com"
              className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
            />
            <button
              type="button"
              onClick={importUrl}
              disabled={busy || !url.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {busy && <Loader2 size={14} aria-hidden className="animate-spin" />}
              {busy ? "Reading…" : "Read the style"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-black/[0.03] px-3.5 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-400">
          Off for now. In the meantime,{" "}
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
          >
            the plain box
          </Link>{" "}
          takes a screenshot of the bit you like — a hero, a pricing table — which shows Kodely far
          more than a palette ever could.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      )}

      {hasReference(ref) && (
        <div className="mt-5 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Check size={13} aria-hidden style={{ color: "var(--accent)" }} />
            Everything Kodely took from {ref.origin ?? "that site"}
          </div>
          {ref.palette.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ref.palette.map((hex) => (
                <span key={hex} className="inline-flex items-center gap-1.5 text-[11px] font-mono">
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 rounded border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: hex }}
                  />
                  {hex}
                </span>
              ))}
            </div>
          )}
          {ref.sections.length > 0 && (
            <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
              Section rhythm: {ref.sections.join(" → ")}
            </p>
          )}
          {ref.corners && (
            <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              Corners: {ref.corners}
            </p>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...state, reference: EMPTY_REFERENCE })}
            className="mt-3 rounded-md text-xs text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:text-white"
          >
            Drop it
          </button>
        </div>
      )}
    </fieldset>
  );
}

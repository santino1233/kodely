"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { destinationAfterAuth } from "@/lib/pending-prompt";
import { getTemplate } from "@/lib/templates";
import {
  assemblePrompt,
  getLook,
  EMPTY_ANSWERS,
  hasAnswers,
  MAX_NAME_CHARS,
  MAX_WHAT_CHARS,
  stashPrompt,
  templatesForCategory,
  WIZARD_CATEGORIES,
  type WizardAnswers,
} from "@/lib/wizard";
import { factRows, SOURCE_LABELS, type FactRow } from "@/lib/site-import";
import { LookPicker } from "./LookPicker";
import {
  EMPTY_IMPORT,
  hasImport,
  hasImportedFacts,
  importFragment,
  ImportStep,
  type ImportState,
} from "./ImportStep";

/**
 * The prompt wizard.
 *
 * ## It is a side door, never a gate
 *
 * The raw composer on the home page is and stays the default: nothing here
 * blocks it, nothing here renders on it, and a returning user never sees this
 * unless they ask for it. Everything below is skippable — the two question
 * screens each carry a Skip, and "Skip to the prompt" on either of them jumps
 * straight to the review with whatever has been answered so far. Abandoning
 * halfway is a productive action, not a loss.
 *
 * ## Zero model calls, and — signed out — zero server calls
 *
 * Assembly is local string work in lib/wizard.ts and lib/site-import.ts. There
 * is no /api/enhance call here and there should not be one: that route is
 * auth-gated and rate limited per user id, and most people meeting this wizard
 * are signed out.
 *
 * Step 3 is the only place that can touch a server at all, and only on the URL
 * path, which is rendered only for a signed-in user on a deployment where the
 * isolated egress fetcher is switched on. The paste box next to it parses in
 * the browser and always works.
 *
 * ## Imported facts get a second look before anything is built
 *
 * A prompt someone typed themselves is theirs, and the editor firing it
 * automatically after signup is right. A prompt carrying an address and a phone
 * number scraped off a web page is different: the failure mode is a
 * published-quality page asserting details the user never read, which turns the
 * never-invent-facts rule from a safeguard into a laundering step. So when the
 * prompt carries imported facts, the review step lists them and Build stays
 * disabled until the user says they have checked them.
 *
 * That closes the wizard's own path. It does NOT close the editor's:
 * app/projects/[id]/Editor.tsx still auto-fires whatever is in sessionStorage
 * on arrival, and giving it a "we pulled this from your site — check it" strip
 * is a change to files outside this one's scope. Until that exists, the
 * confirmation below is the only gate, and it is a real one — the facts are on
 * screen, individually toggleable one step back, and inside the prompt textarea
 * in full.
 */

const STEPS = [
  { id: "what", label: "What and who" },
  { id: "look", label: "Pick a look" },
  { id: "bring", label: "What you have" },
  { id: "review", label: "Your prompt" },
] as const;

const LAST = STEPS.length - 1;

export function PromptWizard({
  signedIn,
  creditEstimate,
  urlImport = false,
}: {
  signedIn: boolean;
  /** From estimateCredits("create") on the server — lib/credits.ts pulls in Prisma. */
  creditEstimate: { low: number; high: number };
  /**
   * Is the isolated egress fetcher switched on for this deployment?
   *
   * Defaults to false so that a caller who has not thought about it gets the
   * safe answer, which is also the answer the server gives: the route refuses
   * with a 503 unless KODELY_SITE_IMPORT_EGRESS is set. With this false the URL
   * fields are not rendered at all and step 3 is the paste box, which needs
   * neither a server nor an account.
   */
  urlImport?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(EMPTY_ANSWERS);
  const [imports, setImports] = useState<ImportState>(EMPTY_IMPORT);
  /** Non-null once the review textarea has been touched. This is what Revert throws away. */
  const [edited, setEdited] = useState<string | null>(null);
  /** Ticked on the review step. Only ever required when facts were imported. */
  const [factsChecked, setFactsChecked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Skip the focus move on first paint — nobody asked to be sent anywhere yet. */
  const mounted = useRef(false);

  const assembled = useMemo(() => {
    const base = assemblePrompt(answers);
    const brought = importFragment(imports, Boolean(answers.lookId));
    return brought ? `${base}\n\n${brought}` : base;
  }, [answers, imports]);
  const promptText = edited ?? assembled;
  const matches = templatesForCategory(answers.category);

  const importedRows = factRows(imports.facts).filter((r) => !imports.excluded.includes(r.key));
  /** The build gate. Nothing imported means nothing extra to confirm. */
  const needsFactCheck = hasImportedFacts(imports);

  // Moving between steps swaps the whole panel, so without this a keyboard or
  // screen-reader user is left focused on a button that no longer means what it
  // did. The sr-only status region below announces the change; this puts the
  // caret where the new content starts.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  /**
   * Any change to an answer invalidates a hand-edit of the assembled prompt —
   * silently keeping the old text would mean the palette they just changed
   * never reaches the build. Dropping the edit is the honest failure: the
   * review step is right there and the edit was one screen ago.
   */
  function update(patch: Partial<WizardAnswers>) {
    setAnswers((prev) => ({ ...prev, ...patch }));
    setEdited(null);
  }

  /**
   * Same contract as `update`, and one addition: any change to what was
   * imported drops the "I've checked these" tick. A confirmation that survives
   * the thing it confirmed changing is not a confirmation.
   */
  function updateImports(next: ImportState) {
    setImports(next);
    setEdited(null);
    setFactsChecked(false);
  }

  function pickCategory(category: WizardAnswers["category"]) {
    const first = templatesForCategory(category)[0];
    update({ category, templateId: first?.id ?? null });
  }

  /**
   * Skip means skip: it clears whatever this screen contributed and moves on,
   * rather than quietly keeping a half-answer the user just decided against.
   * Step 1's fields are all optional, so there is nothing to clear there — it
   * is the same as Next, and having the control present matters more than
   * having it do something different.
   */
  function skip() {
    if (step === 1) update({ lookId: null });
    if (step === 2) updateImports(EMPTY_IMPORT);
    setStep((s) => s + 1);
  }

  async function build() {
    if (starting) return;
    // Belt and braces: the button is already disabled, but this is the one
    // condition where a stale click must not start a build.
    if (needsFactCheck && !factsChecked) return;
    const text = promptText.trim();
    if (!text) return;

    setStarting(true);
    setError(null);

    // Hand off through the SAME pending-prompt mechanism the composer and the
    // template gallery use, rather than inventing a second route into a build.
    // Signed out: /signup shows the prompt back and its submit handler calls
    // destinationAfterAuth(). Signed in: we call it directly.
    if (!stashPrompt(text)) {
      setStarting(false);
      setError(
        "Your browser is blocking session storage, so the prompt can't travel with you. Copy it somewhere safe first, or try a normal (non-private) window.",
      );
      return;
    }

    if (!signedIn) {
      router.push("/signup");
      return;
    }

    // Returns "/dashboard" if project creation fails, including a session that
    // expired since this page rendered — the prompt stays in sessionStorage
    // either way, so nothing is lost. `starting` is deliberately left set:
    // every branch navigates, and a locked button stops a double-click
    // creating two projects.
    const dest = await destinationAfterAuth();
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Step changes are a whole-panel swap with no page navigation, so they
          are invisible to assistive tech unless announced. */}
      <p role="status" className="sr-only">
        {`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}.`}
      </p>

      <div className="rounded-2xl border border-black/10 bg-white/60 p-6 backdrop-blur-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            aria-hidden
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400"
          >
            Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </p>
          <div aria-hidden className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-neutral-900 dark:bg-white"
                    : i < step
                      ? "w-1.5 bg-neutral-900/40 dark:bg-white/40"
                      : "w-1.5 bg-black/10 dark:bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <WhatStep
            headingRef={headingRef}
            answers={answers}
            matches={matches}
            onPickCategory={pickCategory}
            onUpdate={update}
          />
        )}

        {step === 1 && (
          <section className="mt-6">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              Pick a look
            </h2>
            <div className="mt-5">
              <LookPicker value={answers.lookId} onChange={(lookId) => update({ lookId })} />
            </div>
          </section>
        )}

        {step === 2 && (
          <ImportStep
            headingRef={headingRef}
            state={imports}
            onChange={updateImports}
            signedIn={signedIn}
            urlImport={urlImport}
          />
        )}

        {step === 3 && (
          <ReviewStep
            headingRef={headingRef}
            promptText={promptText}
            basis={{
              template: (answers.templateId ? getTemplate(answers.templateId) : undefined)?.name ?? null,
              look: (answers.lookId ? getLook(answers.lookId) : undefined)?.name ?? null,
              imported: hasImport(imports) ? (imports.facts.origin ?? "what you pasted") : null,
            }}
            importedRows={importedRows}
            needsFactCheck={needsFactCheck}
            factsChecked={factsChecked}
            onFactsChecked={setFactsChecked}
            edited={edited}
            onEdit={setEdited}
            onRevert={() => setEdited(null)}
            creditEstimate={creditEstimate}
            signedIn={signedIn}
            starting={starting}
            error={error}
            onBuild={build}
          />
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <ArrowLeft size={14} aria-hidden />
                Back
              </button>
            )}
            {/* Only on the first screen. On the second, "Skip this step" already
                lands on the review, so a second control saying almost the same
                thing would just be two ways to guess. */}
            {step === 0 && (
              <button
                type="button"
                onClick={() => setStep(LAST)}
                className="rounded-lg px-3 py-2 text-sm text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:text-white"
              >
                Skip to the prompt
              </button>
            )}
          </div>

          {step < LAST && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={skip}
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Skip this step
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Next
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The way out. Leaving is never a loss of work while there is any: the
          skip controls above hand back everything answered so far as a finished
          prompt, and this link goes to the plain box, which is the default entry
          point and always was. */}
      <p className="mt-5 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {hasAnswers(answers) && step < LAST ? (
          <>Done answering? Skip ahead for the prompt, or </>
        ) : (
          <>Would rather just type it? </>
        )}
        <Link
          href="/"
          className="underline underline-offset-4 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:text-white"
        >
          go back to the plain box
        </Link>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — what and who
// ---------------------------------------------------------------------------

function WhatStep({
  headingRef,
  answers,
  matches,
  onPickCategory,
  onUpdate,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  answers: WizardAnswers;
  matches: ReturnType<typeof templatesForCategory>;
  onPickCategory: (category: WizardAnswers["category"]) => void;
  onUpdate: (patch: Partial<WizardAnswers>) => void;
}) {
  return (
    <section className="mt-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
      >
        What are you building, and who for?
      </h2>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium">What kind of site is this?</legend>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Kodely loads a starting brief written for that kind of business — the same ones on the{" "}
          <Link
            href="/templates"
            className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
          >
            templates page
          </Link>
          . You read and edit the whole thing at the end.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {WIZARD_CATEGORIES.map((option) => (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name="wizard-category"
                value={option}
                checked={answers.category === option}
                onChange={() => onPickCategory(option)}
                className="peer sr-only"
              />
              <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white/50 px-3.5 py-1.5 text-xs text-neutral-600 backdrop-blur-md transition-colors hover:border-neutral-300 hover:text-neutral-900 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:text-white dark:peer-checked:border-white dark:peer-checked:bg-white dark:peer-checked:text-neutral-900">
                {option}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Only when the category holds more than one starter brief. With a
          single match it is already selected and asking would be busywork.

          The first one is pre-selected rather than left blank: a specific brief
          is the whole reason the gallery and the wizard are one feature. But a
          pre-selection nobody notices is how a pilates studio ends up with the
          barbershop brief, so it is stated out loud below and the choice is one
          click away. */}
      {matches.length > 1 && (
        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Which is closest?</legend>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            This picks the starting brief. Change it if the highlighted one is not you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {matches.map((template) => (
              <label key={template.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="wizard-template"
                  value={template.id}
                  checked={answers.templateId === template.id}
                  onChange={() => onUpdate({ templateId: template.id })}
                  className="peer sr-only"
                />
                <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white/50 px-3.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:text-white dark:peer-checked:border-white dark:peer-checked:bg-white dark:peer-checked:text-neutral-900">
                  {template.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="wizard-name" className="block text-sm font-medium">
            Site or business name{" "}
            <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
          </label>
          <input
            id="wizard-name"
            type="text"
            value={answers.businessName}
            maxLength={MAX_NAME_CHARS}
            onChange={(e) => onUpdate({ businessName: e.target.value })}
            placeholder="Bloom Pilates"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
          />
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            Not named it yet? Leave it — the brief says [your business name] instead.
          </p>
        </div>

        <div>
          <label htmlFor="wizard-what" className="block text-sm font-medium">
            What do you actually do?{" "}
            <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
          </label>
          <input
            id="wizard-what"
            type="text"
            value={answers.whatYouDo}
            maxLength={MAX_WHAT_CHARS}
            onChange={(e) => onUpdate({ whatYouDo: e.target.value })}
            placeholder="a reformer pilates studio in Denver"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
          />
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            One line. It becomes the first sentence of the brief.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — review
// ---------------------------------------------------------------------------

function ReviewStep({
  headingRef,
  promptText,
  basis,
  importedRows,
  needsFactCheck,
  factsChecked,
  onFactsChecked,
  edited,
  onEdit,
  onRevert,
  creditEstimate,
  signedIn,
  starting,
  error,
  onBuild,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  promptText: string;
  /** What the prompt was built from, so a wrong pick is caught before spending. */
  basis: { template: string | null; look: string | null; imported: string | null };
  /** Facts that survived step 3's tickboxes and are going into the build. */
  importedRows: FactRow[];
  needsFactCheck: boolean;
  factsChecked: boolean;
  onFactsChecked: (next: boolean) => void;
  edited: string | null;
  onEdit: (next: string) => void;
  onRevert: () => void;
  creditEstimate: { low: number; high: number };
  signedIn: boolean;
  starting: boolean;
  error: string | null;
  onBuild: () => void;
}) {
  return (
    <section className="mt-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
      >
        Your prompt
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        This is the whole thing Kodely will build from — no hidden settings behind it. Assembled on
        your device from your answers, and no AI has run yet.
      </p>

      {/* Named, not implied. If the wizard started from the wrong brief or the
          wrong palette, this is where someone notices — before any credits. */}
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          Starting brief:{" "}
          <span className="text-neutral-700 dark:text-neutral-300">
            {basis.template ?? "a generic brief"}
          </span>
        </span>
        <span>
          Look:{" "}
          <span className="text-neutral-700 dark:text-neutral-300">
            {basis.look ?? "Kodely chooses"}
          </span>
        </span>
        {basis.imported && (
          <span>
            Imported from:{" "}
            <span className="text-neutral-700 dark:text-neutral-300">{basis.imported}</span>
          </span>
        )}
      </p>

      {/* The gate. Everything in this list is going onto a public page as a
          statement of fact about a real business, and the only person who can
          tell whether it is right is looking at the screen. Build stays
          disabled until they say so — one click on the minority path, and the
          zero-click path is untouched for everyone else. */}
      {needsFactCheck && (
        <div className="mt-5 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-medium">Check these before you build</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            These came off {basis.imported ?? "your site"} and they will appear on the finished page
            as facts. Go back a step to untick or drop anything wrong.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {importedRows.map((row) => (
              <li key={row.key}>
                <span className="font-medium">{row.label}: </span>
                <span className="text-neutral-600 dark:text-neutral-400">{row.value}</span>{" "}
                <span className="text-neutral-400 dark:text-neutral-500">
                  (from {SOURCE_LABELS[row.source]})
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
            <input
              type="checkbox"
              checked={factsChecked}
              onChange={(e) => onFactsChecked(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-neutral-900 dark:accent-white"
            />
            <span>I&apos;ve read these and they are correct.</span>
          </label>
        </div>
      )}

      {/* The same shape as the composer's Enhance strip: a one-line note about
          where the text came from, and a Revert beside it. Accept is pressing
          Build, edit is typing, discard is Revert — no state where someone is
          looking at something they cannot change. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor="wizard-prompt"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
        >
          <Sparkles size={13} aria-hidden style={{ color: "var(--accent)" }} />
          Assembled from your answers — edit anything before you build
        </label>
        {edited !== null && (
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:text-white"
          >
            <RotateCcw size={12} aria-hidden />
            Revert to the wizard&apos;s version
          </button>
        )}
      </div>

      <textarea
        id="wizard-prompt"
        value={promptText}
        onChange={(e) => onEdit(e.target.value)}
        rows={16}
        spellCheck={false}
        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3.5 font-mono text-[11px] leading-relaxed text-neutral-700 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300"
      />

      {/* The one moment a credit estimate is useful rather than alarming: the
          user is about to spend, and they can still edit what they spend on. */}
      <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        A first build usually costs {creditEstimate.low}–{creditEstimate.high} credits. A build that
        fails to compile is never charged.
        {!signedIn && " You'll sign up first — this prompt comes with you."}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onBuild}
        disabled={starting || !promptText.trim() || (needsFactCheck && !factsChecked)}
        className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 sm:w-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {starting ? "Starting…" : "Build this"}
        {!starting && (
          <ArrowRight
            size={14}
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          />
        )}
      </button>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Info, RotateCcw, Sparkles, X } from "lucide-react";

import { AIProgress, stepsAt } from "@/components/ui/AIProgress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { Logo } from "@/components/marketing/Logo";
import { featuresByCategory, NOT_OFFERED, selectedFeatures } from "@/lib/features";
import { getTemplate } from "@/lib/templates";
import {
  getLook,
  LOOK_DIRECTIONS,
  templatesForCategory,
  WIZARD_CATEGORIES,
  type LookDirection,
  type WizardCategory,
} from "@/lib/wizard";

import {
  assembleInlineBrief,
  CREATE_CREDIT_ESTIMATE,
  EMPTY_INLINE_ANSWERS,
  hasInlineAnswers,
  LIMITS,
  TONES,
  type DensityFeel,
  type InlineAnswers,
  type TypeFeel,
} from "./inline-brief";
import { LOGO_ACCEPT, prepareLogo } from "./inline-logo";

/**
 * The inline build wizard — five stages, opened in place on the Create Website
 * page rather than by navigating off to /wizard.
 *
 * ## What it is, and what it is not
 *
 * It is a way to WRITE A PROMPT, and it hands that prompt back through
 * `onComplete`. It never starts a build, never calls a model and never touches
 * the network: every stage is local string work over lib/wizard.ts and
 * lib/features.ts, so it behaves identically on a bad connection and costs
 * nothing to open. The public /wizard is untouched and still works exactly as
 * it did — this SHARES its assembly (`assemblePrompt`) rather than forking it,
 * so a change to the starter briefs reaches both.
 *
 * ## Every stage is skippable, and going back never costs an answer
 *
 * Stage 1 carries a "Skip to the prompt" that jumps straight to review with
 * whatever has been answered so far, and every stage before review has a "Skip
 * this step". Answers live in one state object for the whole session, so Back
 * and Next are lossless in both directions — including across a close and
 * reopen, which resumes exactly where the customer left off rather than
 * discarding their work for tidiness.
 *
 * ## Honesty is the feature
 *
 * Stage 4 offers only what a finished, published Kodely site genuinely does
 * (see the long note at the top of lib/features.ts). Each catch sits next to
 * its own toggle rather than in small print, and the things we cannot build are
 * named on the same screen with the real reason and a real alternative — never
 * as a greyed-out row implying that paying would unlock them. The credit figure
 * on stage 5 is a RANGE, because a build is an agent loop of unknown length and
 * a single number would be a quote nobody can honour.
 */

export type InlineWizardResult = {
  /** The finished, editable build prompt. */
  prompt: string;
  logoDataUrl?: string;
  palette?: string[];
};

const STAGES = [
  { id: "describe", label: "Describe it" },
  { id: "details", label: "Site details" },
  { id: "style", label: "Style & layout" },
  { id: "features", label: "Features" },
  { id: "review", label: "Review & build" },
] as const;

const LAST = STAGES.length - 1;

/**
 * The one focus ring, on a control whose real input is visually hidden.
 *
 * `k-focus` matches an element's OWN :focus-visible, which never fires on a
 * <label> wrapping an sr-only radio — the input is what receives focus. This is
 * the same `has-[:focus-visible]` treatment components/ui/Segmented.tsx uses,
 * with the same values as the `.k-focus` rule in app/globals.css, so the
 * product still has exactly one focus ring.
 */
const WRAPPED_FOCUS =
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 " +
  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand-ring)]";

export function InlineWizard({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (result: InlineWizardResult) => void;
}): React.ReactNode {
  const [stage, setStage] = useState(0);
  const [answers, setAnswers] = useState<InlineAnswers>(EMPTY_INLINE_ANSWERS);
  /** Non-null once the review textarea has been touched. Revert throws it away. */
  const [edited, setEdited] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const assembled = useMemo(() => assembleInlineBrief(answers), [answers]);
  const promptText = edited ?? assembled;

  // Swapping the whole panel leaves a keyboard or screen-reader user focused on
  // a control that no longer means what it did. The sr-only status region below
  // announces the change; this puts the caret where the new content starts.
  // Modal is a child, and child effects commit first, so the dialog is already
  // open and focusable by the time this runs.
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
  }, [open, stage]);

  /**
   * Any change to an answer invalidates a hand-edit of the assembled prompt.
   * Silently keeping the old text would mean the palette they just changed
   * never reaching the build; dropping the edit is the honest failure, and the
   * review stage is one click away. Same contract as the public wizard.
   */
  function update(patch: Partial<InlineAnswers>) {
    setAnswers((prev) => ({ ...prev, ...patch }));
    setEdited(null);
  }

  function pickCategory(category: WizardCategory) {
    const first = templatesForCategory(category)[0];
    update({ category, templateId: first?.id ?? null });
  }

  function toggleFeature(id: string) {
    setAnswers((prev) => ({
      ...prev,
      featureIds: prev.featureIds.includes(id)
        ? prev.featureIds.filter((f) => f !== id)
        : [...prev.featureIds, id],
    }));
    setEdited(null);
  }

  /**
   * Skip.
   *
   * On the two CHOICE stages it means "no preference", so it clears what that
   * stage contributed — a look half-picked and then skipped past is not what
   * the customer asked for. On the two TEXT stages every field is already
   * optional, so skipping is the same as Next and nothing typed is thrown away;
   * the control is still there because being able to move on without reading
   * the fields is the point. Same reasoning the public wizard records for its
   * own first step.
   */
  function skip() {
    if (stage === 2) {
      update({ lookId: null, tone: null, typeFeel: "look", density: "look", logo: null });
      setLogoError(null);
    }
    if (stage === 3) update({ featureIds: [] });
    setStage((s) => Math.min(s + 1, LAST));
  }

  function finish() {
    const text = promptText.trim();
    if (!text) return;
    const look = answers.lookId ? getLook(answers.lookId) : undefined;
    onComplete({
      prompt: text,
      ...(answers.logo ? { logoDataUrl: answers.logo.dataUrl } : {}),
      ...(look ? { palette: look.gradient.colors } : {}),
    });
  }

  const matches = templatesForCategory(answers.category);
  const chosenFeatures = selectedFeatures(answers.featureIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Build your website"
      description="Five short stages. Every one is optional, and you read and edit the finished prompt before anything is built."
      footer={
        <>
          <div className="mr-auto flex items-center gap-1">
            {stage > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft size={14} />}
                onClick={() => setStage((s) => Math.max(s - 1, 0))}
              >
                Back
              </Button>
            )}
            {/* Only on the first stage. Anywhere later "Skip this step" already
                walks forward, and a second control saying almost the same thing
                would just be two ways to guess. */}
            {stage === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStage(LAST)}>
                Skip to the prompt
              </Button>
            )}
          </div>

          {stage < LAST ? (
            <>
              <Button variant="ghost" size="sm" onClick={skip}>
                Skip this step
              </Button>
              <Button
                variant="primary"
                size="sm"
                iconRight={<ArrowRight size={14} />}
                onClick={() => setStage((s) => Math.min(s + 1, LAST))}
              >
                Next
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkles size={14} />}
              disabled={!promptText.trim()}
              onClick={finish}
            >
              Use this prompt
            </Button>
          )}
        </>
      }
    >
      {/* Stage changes are a whole-panel swap with no navigation behind them,
          so they are invisible to assistive tech unless announced. */}
      <p role="status" className="sr-only">
        {`Stage ${stage + 1} of ${STAGES.length}: ${STAGES[stage].label}.`}
      </p>

      <div className="flex items-center justify-between gap-3 border-b border-hair pb-3">
        <Logo markSize={20} className="text-[0.9375rem]" />
        <Badge tone="brand">
          Stage <span className="k-num">{stage + 1}</span> of{" "}
          <span className="k-num">{STAGES.length}</span>
        </Badge>
      </div>

      {/* The rail is the visual half of the indicator only — the sr-only status
          line above is what a screen reader hears. Hidden from the tree rather
          than left to compete with it: AIProgress carries its own aria-live,
          and two announcements for one change is one too many. */}
      <div aria-hidden className="mt-3.5">
        <AIProgress
          steps={stepsAt(STAGES, stage)}
          className="sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1.5"
        />
      </div>

      {/* Its own scroll region so Back and Next never leave the viewport on a
          laptop. The dialog would otherwise scroll as a whole, putting the only
          way forward below the fold on the longest stages. */}
      <div className="mt-4 max-h-[min(56vh,30rem)] overflow-y-auto pr-1">
        {stage === 0 && (
          <DescribeStage
            headingRef={headingRef}
            answers={answers}
            matches={matches}
            onPickCategory={pickCategory}
            onUpdate={update}
          />
        )}
        {stage === 1 && <DetailsStage headingRef={headingRef} answers={answers} onUpdate={update} />}
        {stage === 2 && (
          <StyleStage
            headingRef={headingRef}
            answers={answers}
            onUpdate={update}
            logoError={logoError}
            onLogoError={setLogoError}
          />
        )}
        {stage === 3 && (
          <FeaturesStage
            headingRef={headingRef}
            selected={answers.featureIds}
            onToggle={toggleFeature}
          />
        )}
        {stage === 4 && (
          <ReviewStage
            headingRef={headingRef}
            promptText={promptText}
            edited={edited}
            onEdit={setEdited}
            onRevert={() => setEdited(null)}
            basis={{
              template:
                (answers.templateId ? getTemplate(answers.templateId) : undefined)?.name ?? null,
              look: (answers.lookId ? getLook(answers.lookId) : undefined)?.name ?? null,
              features: chosenFeatures.length,
              logo: answers.logo?.name ?? null,
            }}
            caveats={chosenFeatures.flatMap((f) =>
              f.caveat != null ? [{ id: f.id, label: f.label, caveat: f.caveat }] : [],
            )}
            answered={hasInlineAnswers(answers)}
          />
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function StageHeading({
  headingRef,
  title,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="k-h2 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-ring)]"
      >
        {title}
      </h3>
      {children != null && (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">{children}</p>
      )}
    </>
  );
}

/** A single-select chip. Real radios, so arrow keys and "3 of 8" come free. */
function Chip({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--t-1)] ${WRAPPED_FOCUS} ${
        checked
          ? "border-brand bg-brand-tint text-brand-ink dark:text-brand"
          : "border-hair bg-surface-2 text-ink-2 hover:border-line-mid hover:text-ink"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {children}
    </label>
  );
}

/** The line a customer needs before they tick a box, not after they publish. */
function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-warn">
      <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stage 1 — Describe
// ---------------------------------------------------------------------------

function DescribeStage({
  headingRef,
  answers,
  matches,
  onPickCategory,
  onUpdate,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  answers: InlineAnswers;
  matches: ReturnType<typeof templatesForCategory>;
  onPickCategory: (category: WizardCategory) => void;
  onUpdate: (patch: Partial<InlineAnswers>) => void;
}) {
  return (
    <section>
      <StageHeading headingRef={headingRef} title="What are you building?">
        In your own words. This becomes the opening line of the brief, so a sentence about who it is
        for is worth more than a list of features.
      </StageHeading>

      <div className="mt-4">
        <Textarea
          label="Describe it"
          className="min-h-24"
          maxLength={LIMITS.describe}
          // Lower-case on purpose: the first sentence becomes the tail of
          // "Build a one-page website for [name] — …", so the placeholder shows
          // the shape that reads best there.
          placeholder="a reformer pilates studio in Denver, for people who have tried a big-box gym and hated it"
          value={answers.describe}
          onChange={(e) => onUpdate({ describe: e.target.value })}
          hint="Optional, like everything here. Skip it and Kodely starts from the brief for the kind of business you pick below."
        />
      </div>

      <fieldset className="mt-5">
        <legend className="text-[0.8125rem] font-medium text-ink">What kind of site is this?</legend>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          This loads a starting brief written for that kind of business — the same ones behind the
          template gallery. You read and edit the whole thing on the last stage.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WIZARD_CATEGORIES.map((option) => (
            <Chip
              key={option}
              name="inline-category"
              value={option}
              checked={answers.category === option}
              onSelect={() => onPickCategory(option)}
            >
              {option}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* Only when the category holds more than one starter brief. With a single
          match it is already selected and asking would be busywork. The first is
          pre-selected rather than left blank, but a pre-selection nobody notices
          is how a pilates studio ends up with the barbershop brief — so it is
          said out loud, and changing it is one click. */}
      {matches.length > 1 && (
        <fieldset className="mt-5">
          <legend className="text-[0.8125rem] font-medium text-ink">Which is closest?</legend>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            This picks the starting brief. Change it if the highlighted one is not you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {matches.map((template) => (
              <Chip
                key={template.id}
                name="inline-template"
                value={template.id}
                checked={answers.templateId === template.id}
                onSelect={() => onUpdate({ templateId: template.id })}
              >
                {template.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — Site details
// ---------------------------------------------------------------------------

function DetailsStage({
  headingRef,
  answers,
  onUpdate,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  answers: InlineAnswers;
  onUpdate: (patch: Partial<InlineAnswers>) => void;
}) {
  return (
    <section>
      <StageHeading headingRef={headingRef} title="The details Kodely can’t guess">
        Anything you leave blank stays an obvious placeholder like [your phone number]. Kodely never
        invents an address, a price or an opening time for a real business.
      </StageHeading>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Business or site name"
          maxLength={LIMITS.businessName}
          placeholder="Bloom Pilates"
          value={answers.businessName}
          onChange={(e) => onUpdate({ businessName: e.target.value })}
          hint="Used in the copy, the browser tab and the link preview."
        />
        <Input
          label="Where you are"
          maxLength={LIMITS.location}
          placeholder="Denver, Colorado"
          value={answers.location}
          onChange={(e) => onUpdate({ location: e.target.value })}
          hint="A town or neighbourhood is enough — the full address can wait."
        />
        <Input
          label="Email for enquiries"
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={LIMITS.email}
          placeholder="hello@bloompilates.com"
          value={answers.email}
          onChange={(e) => onUpdate({ email: e.target.value })}
          hint="Becomes the “Email us” link, and where form messages are sent."
        />
        <Input
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={LIMITS.phone}
          placeholder="+1 303 555 0134"
          value={answers.phone}
          onChange={(e) => onUpdate({ phone: e.target.value })}
          hint="Becomes a tap-to-call link on a phone."
        />
      </div>

      <div className="mt-4 grid gap-4">
        <Textarea
          label="The main things you offer"
          className="min-h-20"
          maxLength={LIMITS.offerings}
          placeholder={"Reformer classes\nPrivate sessions\nBeginner courses"}
          value={answers.offerings}
          onChange={(e) => onUpdate({ offerings: e.target.value })}
          hint="One per line. These become the sections and their headings."
        />
        <Textarea
          label="Opening hours"
          className="min-h-16"
          maxLength={LIMITS.hours}
          placeholder={"Mon–Fri 6am–8pm\nSat 8am–1pm\nSun closed"}
          value={answers.hours}
          onChange={(e) => onUpdate({ hours: e.target.value })}
          hint="One per line. Leave out any day you are unsure of — a guessed closing time sends somebody to a locked door."
        />
        <Textarea
          label="Links you already have"
          className="min-h-16"
          maxLength={LIMITS.links}
          placeholder={"https://instagram.com/bloompilates\nhttps://bookings.example.com"}
          value={answers.links}
          onChange={(e) => onUpdate({ links: e.target.value })}
          hint="One per line — social profiles, and the booking or ordering service you already use."
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage 3 — Style and layout
// ---------------------------------------------------------------------------

function StyleStage({
  headingRef,
  answers,
  onUpdate,
  logoError,
  onLogoError,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  answers: InlineAnswers;
  onUpdate: (patch: Partial<InlineAnswers>) => void;
  logoError: string | null;
  onLogoError: (error: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared straight away so picking the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;
    const result = await prepareLogo(file);
    if (!result.ok) {
      onLogoError(result.error);
      return;
    }
    onLogoError(null);
    onUpdate({ logo: { dataUrl: result.dataUrl, name: result.name, bytes: result.bytes } });
  }

  return (
    <section>
      <StageHeading headingRef={headingRef} title="How should it look?">
        Every direction below is a real palette from Kodely’s own catalogue, so the build gets these
        exact hex values rather than an interpretation of an adjective. Skip it and Kodely chooses.
      </StageHeading>

      <fieldset className="mt-4">
        <legend className="sr-only">Colour and layout direction</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {LOOK_DIRECTIONS.map((look) => (
            <LookCard
              key={look.id}
              look={look}
              checked={answers.lookId === look.id}
              onSelect={() => onUpdate({ lookId: look.id })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[0.8125rem] font-medium text-ink">How should it read?</legend>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          The voice of the words, not the colours — the two are chosen separately on purpose.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TONES.map((tone) => (
            <Chip
              key={tone.id}
              name="inline-tone"
              value={tone.id}
              checked={answers.tone === tone.id}
              onSelect={() => onUpdate({ tone: tone.id })}
            >
              {tone.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-4">
        <div>
          <p className="k-label text-ink-3">Typography</p>
          <div className="mt-2">
            <Segmented
              name="inline-type"
              ariaLabel="Typography"
              size="sm"
              value={answers.typeFeel}
              onChange={(v: TypeFeel) => onUpdate({ typeFeel: v })}
              options={[
                { value: "look", label: "Look decides" },
                { value: "sans", label: "Sans" },
                { value: "serif", label: "Serif headings" },
              ]}
            />
          </div>
        </div>
        <div>
          <p className="k-label text-ink-3">Spacing</p>
          <div className="mt-2">
            <Segmented
              name="inline-density"
              ariaLabel="Spacing"
              size="sm"
              value={answers.density}
              onChange={(v: DensityFeel) => onUpdate({ density: v })}
              options={[
                { value: "look", label: "Look decides" },
                { value: "roomy", label: "Roomy" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        There are no web fonts on a Kodely site — the sandbox blocks every one, base64 included — so
        these pick between system stacks rather than typefaces.
      </p>

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-hair pt-4">
        <p className="text-[0.8125rem] font-medium text-ink">Your logo</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          Kodely looks at it once, on the first attempt, and pulls the palette towards it.
        </p>
        <Caveat>
          The image file itself can’t go on the page — Kodely sites carry no uploaded pictures. The
          brief asks for a clearly-marked space where your logo goes instead.
        </Caveat>

        {answers.logo !== null ? (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-hair bg-surface-2 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={answers.logo.dataUrl}
              alt={`Logo: ${answers.logo.name}`}
              className="size-11 shrink-0 rounded-md bg-surface object-contain p-1"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium text-ink">{answers.logo.name}</p>
              <p className="k-num text-xs text-ink-3">
                Resized to about {Math.max(1, Math.round(answers.logo.bytes / 1024))} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={() => {
                onUpdate({ logo: null });
                onLogoError(null);
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="sr-only"
              onChange={(e) => void pickLogo(e)}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={15} />}
              onClick={() => fileRef.current?.click()}
            >
              Upload a logo
            </Button>
            <span className="text-xs text-ink-3">PNG, JPEG or WebP. Not SVG.</span>
          </div>
        )}

        {logoError !== null && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {logoError}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One look direction, drawn entirely in CSS.
 *
 * A rendered preview of the real thing would mean six actual builds — well over
 * a thousand credits before anybody has agreed to anything — so each card is
 * the gradient band straight out of the asset catalogue, the direction's own
 * heading stack demonstrating itself, and the literal hexes.
 *
 * No text sits on a gradient anywhere: white on these presets fails contrast
 * badly, and the pale ones fail it worst. The band is decorative and hidden;
 * every word is on the card's own surface.
 *
 * A <label> accepts only phrasing content, so each wrapper below is a span set
 * to display:block rather than a div — the same reason LookPicker.tsx gives.
 */
function LookCard({
  look,
  checked,
  onSelect,
}: {
  look: LookDirection;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={`block cursor-pointer rounded-lg ${WRAPPED_FOCUS}`}>
      <input
        type="radio"
        name="inline-look"
        value={look.id}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={`block overflow-hidden rounded-lg border transition-colors duration-[var(--t-1)] ${
          checked ? "border-brand shadow-e2" : "border-hair hover:border-line-mid"
        }`}
      >
        {/* The hairline matters for the darkest presets: without it the band is
            indistinguishable from the panel behind it in dark mode and reads as
            a rendering fault rather than as a swatch. */}
        <span
          aria-hidden
          className="relative block h-11 border-b border-hair"
          style={{ backgroundImage: look.gradient.css }}
        >
          {checked && (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-surface text-ink shadow-e1">
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="block bg-surface p-3">
          <span
            className="block text-[0.9375rem] leading-tight text-ink"
            style={{
              fontFamily: look.headingFont,
              fontWeight: look.headingWeight,
              letterSpacing: look.headingTracking,
            }}
          >
            {look.name}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-ink-2">{look.blurb}</span>
          <span className="mt-2 flex flex-wrap items-center gap-1">
            {look.gradient.colors.map((hex) => (
              <span
                key={hex}
                className="k-num inline-flex items-center gap-1 rounded-full border border-hair py-0.5 pr-1.5 pl-0.5 text-[10px] text-ink-3"
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full ring-1 ring-hair ring-inset"
                  style={{ background: hex }}
                />
                {hex}
              </span>
            ))}
          </span>
        </span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Stage 4 — Features
// ---------------------------------------------------------------------------

function FeaturesStage({
  headingRef,
  selected,
  onToggle,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const groups = featuresByCategory();

  return (
    <section>
      <StageHeading headingRef={headingRef} title="What should the site have on it?">
        Only things a finished Kodely site genuinely does. Where one comes with a catch, the catch is
        beside the box and not in the small print.
      </StageHeading>

      {groups.map((group) => (
        <fieldset key={group.category} className="mt-5">
          <legend className="k-label text-ink-3">{group.category}</legend>
          <div className="mt-2 grid gap-2">
            {group.features.map((feature) => {
              const checked = selected.includes(feature.id);
              return (
                <label
                  key={feature.id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-[var(--t-1)] ${WRAPPED_FOCUS} ${
                    checked
                      ? "border-brand bg-brand-tint"
                      : "border-hair bg-surface hover:border-line-mid hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(feature.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] font-medium text-ink">
                      {feature.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">
                      {feature.description}
                    </span>
                    {feature.caveat != null && <Caveat>{feature.caveat}</Caveat>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/* Named, not hidden, and never as a greyed-out row implying that paying
          would unlock it. Nothing here is "coming soon" — each one is a
          consequence of what a generated site IS, so the honest move is to say
          so and point at the thing that does work. */}
      <details className="mt-6 rounded-lg border border-hair bg-surface-2">
        <summary className="k-focus cursor-pointer rounded-lg px-3 py-2.5 text-[0.8125rem] font-medium text-ink">
          What Kodely can’t build — and what to do instead
        </summary>
        <ul className="space-y-3 border-t border-hair px-3 py-3">
          {NOT_OFFERED.map((item) => (
            <li key={item.id}>
              <p className="text-[0.8125rem] font-medium text-ink">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{item.reason}</p>
              <p className="mt-1 text-xs leading-relaxed text-ok">
                <span className="font-medium">Instead: </span>
                {item.instead}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage 5 — Review and build
// ---------------------------------------------------------------------------

function ReviewStage({
  headingRef,
  promptText,
  edited,
  onEdit,
  onRevert,
  basis,
  caveats,
  answered,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  promptText: string;
  edited: string | null;
  onEdit: (next: string) => void;
  onRevert: () => void;
  /** What the prompt was built from, so a wrong pick is caught before spending. */
  basis: { template: string | null; look: string | null; features: number; logo: string | null };
  caveats: { id: string; label: string; caveat: string }[];
  answered: boolean;
}) {
  return (
    <section>
      <StageHeading headingRef={headingRef} title="Your prompt">
        This is the whole thing Kodely will build from — there are no hidden settings behind it.
        Assembled on your device from your answers, and no AI has run yet.
      </StageHeading>

      {/* Named, not implied. If the wizard started from the wrong brief or the
          wrong palette, this is where somebody notices — before any credits. */}
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
        <span>
          Starting brief:{" "}
          <span className="text-ink-2">{basis.template ?? "a generic one-pager"}</span>
        </span>
        <span>
          Look: <span className="text-ink-2">{basis.look ?? "Kodely chooses"}</span>
        </span>
        <span>
          Features:{" "}
          <span className="text-ink-2">
            {basis.features === 0 ? (
              "none added"
            ) : (
              <>
                <span className="k-num">{basis.features}</span> added
              </>
            )}
          </span>
        </span>
        {basis.logo !== null && (
          <span>
            Logo: <span className="text-ink-2">{basis.logo}</span>
          </span>
        )}
      </p>

      {!answered && (
        <p className="mt-3 rounded-md border border-hair bg-surface-2 p-2.5 text-xs leading-relaxed text-ink-2">
          You skipped every stage, so this is the generic one-page brief. It still builds a real
          site — going back and answering even one stage makes it yours.
        </p>
      )}

      {/* Every catch the customer accepted, gathered at the moment they are
          about to spend, rather than trusting that each was read beside its own
          toggle a few screens ago. */}
      {caveats.length > 0 && (
        <div className="mt-3 rounded-md border border-hair bg-warn-tint p-3">
          <p className="text-xs font-medium text-warn">Worth knowing before you build</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-2">
            {caveats.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-ink">{c.label}: </span>
                {c.caveat}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
          <Sparkles size={13} aria-hidden className="text-brand" />
          Assembled from your answers — edit anything before you build
        </span>
        {edited !== null && (
          <Button variant="ghost" size="xs" icon={<RotateCcw size={12} />} onClick={onRevert}>
            Revert to the wizard’s version
          </Button>
        )}
      </div>

      <div className="mt-2">
        <Textarea
          aria-label="The build prompt"
          rows={14}
          spellCheck={false}
          value={promptText}
          onChange={(e) => onEdit(e.target.value)}
          className="bg-inset font-mono text-[11px] leading-relaxed"
        />
      </div>

      {/* The one moment a credit figure is useful rather than alarming: they are
          about to spend, and they can still change what they spend it on. A
          RANGE, never a quote — a build is an agent loop of unknown length. */}
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        A first build usually costs{" "}
        <span className="k-num text-ink-2">
          {CREATE_CREDIT_ESTIMATE.low}–{CREATE_CREDIT_ESTIMATE.high}
        </span>{" "}
        credits, depending on how much you have asked for. It is metered from what the build actually
        uses rather than quoted up front, and a build that fails to compile is never charged.
      </p>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Hammer, LayoutTemplate, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHero } from "@/components/ui/PageHero";
import { useToast } from "@/components/ui/Toast";
import { getTemplate } from "@/lib/templates";
import {
  TemplatePickerModal,
  type TemplatePickerResult,
} from "@/components/templates/TemplatePickerModal";
import { InlineWizard, type InlineWizardResult } from "@/components/wizard/InlineWizard";
import { PromptBox } from "./PromptBox";
import {
  ACCEPTED_VIDEO_TYPES,
  PDF_TYPE,
  extractVideoFirstFrame,
  prepareReferenceDocument,
  prepareReferenceImage,
} from "./attachment";

export type CreditContext = {
  balance: number;
  estimate: { low: number; high: number };
  cap: { cap: number | null; spent: number; remaining: number | null; reached: boolean };
};

/**
 * The one IMAGE attached to this build — from the template picker, the
 * wizard, directly on this page via the "+" button/paste/drop, OR now as the
 * first-frame extraction of a directly-attached video (see attachFile below).
 * Kept as `AttachedLogo`/`logo`/`onLogoChange` rather than renamed to
 * something like `AttachedImage`: CreateFlow.tsx already imports this exact
 * shape, and a rename would be cosmetic at best and a compile break at worst.
 * Direct attachment often is not a logo at all (a screenshot, a product photo,
 * a video's first frame pasted for colour/style), so the on-page copy below
 * no longer calls it "your logo" — only the type name does.
 *
 * `dataUrl` is already a `data:image/(png|jpeg|webp);base64,…` — produced by
 * components/templates/logo.ts / components/wizard/inline-logo.ts for the two
 * helper flows, and by ./attachment.ts's prepareReferenceImage() (directly, or
 * via extractVideoFirstFrame()) for a direct attachment. It travels to
 * app/api/generate/route.ts as the `image` field and reaches the model on
 * attempt 1 — see the note in CreateFlow.tsx for why that, and not the
 * brand-kit route, is where an image picked up here can honestly go.
 *
 * This and `AttachedDocument` right below are mutually exclusive: there is
 * exactly one reference-file slot on this page, and it holds either an image
 * (or a video's extracted frame, which IS an image by the time it reaches
 * this type) or a PDF, never both — see attachFile's onLogoChange(null) /
 * onReferenceDocumentChange(null) pairing.
 */
export type AttachedLogo = { dataUrl: string; bytes: number };

/**
 * The one PDF attached to this build — the second, newer half of the same
 * single reference-file slot `AttachedLogo` describes above. `dataUrl` is
 * `data:application/pdf;base64,…`, produced by ./attachment.ts's
 * prepareReferenceDocument(). It travels to app/api/generate/route.ts as the
 * new `document` field, gated to attempt 1 exactly like `image` — see
 * lib/agent.ts's message construction for both.
 */
export type AttachedDocument = { dataUrl: string; bytes: number; name: string };

/** What a completed helper flow hands back to the page. */
export type AssistResult = {
  /** Lands in the box, editable. Nothing is ever built without a look at it. */
  prompt: string;
  logo: AttachedLogo | null;
  templateName: string | null;
};

/** Base64 payload size, minus the `data:image/png;base64,` prefix. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? 0 : Math.round((dataUrl.length - comma - 1) * 0.75);
}

/**
 * Make sure the palette a helper flow returned is actually IN the text.
 *
 * Both flows already write their palette into the prompt they assemble (the
 * `- Palette: <id> (#a to #b)` line from lib/wizard.ts and
 * components/templates/intake.ts), so in the normal case this changes nothing.
 * It exists so that a palette which for any reason did NOT make it into the
 * prose is folded in rather than silently dropped — the customer picked those
 * colours, and `palette` arriving with nowhere to go would mean it never
 * reached the build.
 *
 * Appended to the composer's own text, not to the request behind the
 * customer's back: it is then visible and editable like everything else in the
 * box, which is the whole rule for these hand-offs.
 */
function withPalette(prompt: string, palette: string[] | undefined): string {
  if (!palette || palette.length === 0) return prompt;
  const lower = prompt.toLowerCase();
  if (palette.every((hex) => lower.includes(hex.toLowerCase()))) return prompt;
  return `${prompt}\n\nUse these exact colours as the palette: ${palette.join(
    ", ",
  )}. Make them the dominant colours and derive everything else from those hexes — do not substitute a different palette.`;
}

export function Composer({
  value,
  onChange,
  logo,
  onLogoChange,
  referenceDocument,
  onReferenceDocumentChange,
  onAssist,
  onSubmit,
  fromTemplate,
  credits,
  canTopUp,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Lifted to the flow so a retry after a refused build keeps the logo the
      customer handed over, instead of quietly dropping it. */
  logo: AttachedLogo | null;
  onLogoChange: (logo: AttachedLogo | null) => void;
  /** Same idea as `logo`/`onLogoChange`, for the PDF half of the one
      reference-file slot — see the note on AttachedDocument above. Named
      `referenceDocument`, not `document`, so it never shadows the global DOM
      `document` object inside this component. */
  referenceDocument: AttachedDocument | null;
  onReferenceDocumentChange: (document: AttachedDocument | null) => void;
  onAssist: (result: AssistResult) => void;
  onSubmit: () => void;
  fromTemplate: string | null;
  credits: CreditContext;
  /** False when Stripe is not configured — the billing page is still the
      credit ledger, but calling the link "Top up" would be a dead end. */
  canTopUp: boolean;
}) {
  // Both helpers open OVER this page rather than navigating to
  // /dashboard/templates or /wizard. Leaving the page to fetch a sentence and
  // coming back is the thing this replaces; the box the customer was looking
  // at stays where it was and simply fills in.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const pushToast = useToast();

  const { balance, estimate, cap } = credits;
  const outOfCredits = balance <= 0;
  const capReached = cap.reached;
  const tight = !outOfCredits && balance < estimate.high;
  const capTight = !capReached && cap.remaining !== null && cap.remaining < estimate.high;

  const blocked = outOfCredits || capReached;
  const ready = value.trim().length > 0 && !blocked;

  function acceptTemplate(result: TemplatePickerResult) {
    setPickerOpen(false);
    onAssist({
      prompt: withPalette(result.prompt, result.palette),
      logo: result.logoDataUrl
        ? { dataUrl: result.logoDataUrl, bytes: dataUrlBytes(result.logoDataUrl) }
        : null,
      templateName: getTemplate(result.templateId)?.name ?? null,
    });
  }

  /**
   * The "+" button, a paste, and a drop onto the box all end up here — one
   * path so all three agree on what counts as a valid attachment, and there
   * is exactly one reference-file slot: attaching a new file always replaces
   * whichever of `logo`/`referenceDocument` was holding it (they never both
   * hold something at once — each branch below clears the other).
   *
   * Three real kinds, three real paths:
   *   - a PDF is read as bytes and travels as the `document` field — the
   *     model reads the actual document.
   *   - a video has NO input path on the Anthropic API at all. What actually
   *     happens is extractVideoFirstFrame() grabs one still PNG frame and
   *     runs it through the exact same prepareReferenceImage() an ordinary
   *     image goes through, so it becomes an `AttachedLogo` like any other
   *     image and travels as the `image` field. The toast below says exactly
   *     that — a still frame, not the video — so nobody thinks the model
   *     watched or listened to anything.
   *   - anything else goes through prepareReferenceImage() as before; its own
   *     error message (for a rejected but still-image-shaped type, e.g. HEIC
   *     or SVG, or for anything not image/video/PDF at all) is the honest
   *     rejection for everything this composer doesn't support.
   */
  async function attachFile(file: File, extraIgnored = 0) {
    const replacing = logo !== null || referenceDocument !== null;

    if (file.type === PDF_TYPE) {
      const result = await prepareReferenceDocument(file);
      if (!result.ok) {
        pushToast({ tone: "danger", message: result.error });
        return;
      }
      onLogoChange(null);
      onReferenceDocumentChange({ dataUrl: result.dataUrl, bytes: result.bytes, name: result.name });
      announceAttachment(
        "PDF",
        replacing,
        extraIgnored,
        "Kodely will read its text and layout on the first build attempt — it does not become part of the site.",
      );
      return;
    }

    if ((ACCEPTED_VIDEO_TYPES as readonly string[]).includes(file.type)) {
      const result = await extractVideoFirstFrame(file);
      if (!result.ok) {
        pushToast({ tone: "danger", message: result.error });
        return;
      }
      onReferenceDocumentChange(null);
      onLogoChange({ dataUrl: result.dataUrl, bytes: result.bytes });
      announceAttachment(
        "Video's first frame",
        replacing,
        extraIgnored,
        "Kodely only sees that one still image, on the first build attempt — never the motion or audio.",
      );
      return;
    }

    const result = await prepareReferenceImage(file);
    if (!result.ok) {
      pushToast({ tone: "danger", message: result.error });
      return;
    }

    onReferenceDocumentChange(null);
    onLogoChange({ dataUrl: result.dataUrl, bytes: result.bytes });
    announceAttachment("Image", replacing, extraIgnored, "Kodely will look at it on the first build attempt.");
  }

  // Only one reference file ever reaches the build, so the newest attachment
  // always wins — this just makes sure that's said out loud rather than the
  // previous attachment quietly vanishing with no explanation.
  function announceAttachment(label: string, replacing: boolean, extraIgnored: number, epilogue: string) {
    const notes: string[] = [];
    if (replacing) notes.push("replaced what you had attached");
    if (extraIgnored > 0) {
      notes.push(`only used one of the ${extraIgnored + 1} files you dropped`);
    }
    pushToast({
      tone: "ok",
      message: notes.length > 0 ? `${label} attached — ${notes.join("; ")}.` : `${label} attached — ${epilogue}`,
    });
  }

  function acceptWizard(result: InlineWizardResult) {
    setWizardOpen(false);
    onAssist({
      prompt: withPalette(result.prompt, result.palette),
      logo: result.logoDataUrl
        ? { dataUrl: result.logoDataUrl, bytes: dataUrlBytes(result.logoDataUrl) }
        : null,
      templateName: null,
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* No top margin here — the parent (CreateFlow) now centers this
          whole block vertically in the viewport, so extra space above it
          would push it off-center rather than give it room. */}
      <PageHero
        icon={<Hammer className="size-5" aria-hidden />}
        title="What do you want to build?"
        description="Describe it in your own words. Kodely writes a real site — React, Tailwind, your copy, as many pages as it actually needs — and you keep editing it by asking for changes."
      />

      <div className="mt-8">
        <PromptBox
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          canSubmit={ready}
          onAttachFile={attachFile}
        >
          {(fromTemplate !== null || logo !== null || referenceDocument !== null) && (
            <div className="flex flex-col gap-2 px-6 pt-4">
              {fromTemplate !== null && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">Started from “{fromTemplate}”</Badge>
                  <span className="text-xs text-ink-3">
                    It is just text — change anything before you build.
                  </span>
                </div>
              )}

              {logo !== null && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.dataUrl}
                    alt="The image you attached"
                    className="size-10 shrink-0 rounded-md border border-hair object-contain"
                  />
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-3">
                    This image travels with this build. Kodely looks at it on the{" "}
                    <span className="k-num">first</span> attempt only — about{" "}
                    <span className="k-num">
                      {Math.max(1, Math.round(logo.bytes / 1024))} KB
                    </span>
                    . It is guidance for the colours and character, not a file that gets
                    uploaded; the brief above says what to do with the space it belongs in.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={() => onLogoChange(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}

              {referenceDocument !== null && (
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-hair bg-surface-2 text-ink-3">
                    <FileText size={18} aria-hidden />
                  </div>
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-3">
                    <span className="truncate font-medium text-ink-2">{referenceDocument.name}</span> travels
                    with this build. Kodely reads its text and layout on the{" "}
                    <span className="k-num">first</span> attempt only — about{" "}
                    <span className="k-num">
                      {Math.max(1, Math.round(referenceDocument.bytes / 1024))} KB
                    </span>
                    . It is content and structure guidance, not a file that gets embedded in the
                    output site.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={() => onReferenceDocumentChange(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          )}
        </PromptBox>
      </div>

      {/* The two side doors, below the box rather than beside it: the raw box
          stays the default, and neither helper is ever a gate. Both open in
          place and both hand their text back into the box above, editable —
          nothing is built until the customer presses the button themselves. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <AssistChip icon={<LayoutTemplate size={14} />} onClick={() => setPickerOpen(true)}>
          Use a template
        </AssistChip>
        <AssistChip icon={<Wand2 size={14} />} onClick={() => setWizardOpen(true)}>
          Help me write it
        </AssistChip>
      </div>

      <div className="mt-8">
        <CreditNote
          balance={balance}
          outOfCredits={outOfCredits}
          tight={tight}
          cap={cap}
          capReached={capReached}
          capTight={capTight}
          canTopUp={canTopUp}
        />
      </div>

      <TemplatePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onComplete={acceptTemplate}
      />
      <InlineWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={acceptWizard}
      />
    </div>
  );
}

function AssistChip({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="k-focus inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-2 shadow-e1 transition-[color,border-color,background] duration-[var(--t-1)] hover:border-line-mid hover:bg-surface-2 hover:text-ink"
    >
      <span className="text-ink-3" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  );
}

function CreditNote({
  balance,
  outOfCredits,
  tight,
  cap,
  capReached,
  capTight,
  canTopUp,
}: {
  balance: number;
  outOfCredits: boolean;
  tight: boolean;
  cap: CreditContext["cap"];
  capReached: boolean;
  capTight: boolean;
  canTopUp: boolean;
}) {
  return (
    <div className="rounded-xl border border-hair bg-surface-2/60 p-4">
      <p className="text-[0.8125rem] text-ink-2">
        You have <span className="k-num font-semibold text-ink">{balance}</span> credits
      </p>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        You are charged only for the attempt you asked for. If the first output doesn’t compile,
        Kodely’s repair pass is on us, and a build that fails outright costs you nothing.
      </p>

      {outOfCredits && (
        <Callout tone="danger">
          You’re out of credits, so a build would be refused before it started.
          {canTopUp ? " Top up and this brief will still be here." : " Top-ups are unavailable right now."}
          <CalloutAction
            href="/dashboard/billing"
            label={canTopUp ? "Top up credits" : "See your credit ledger"}
          />
        </Callout>
      )}

      {tight && (
        <Callout tone="warn">
          That’s below what a first build usually costs. Your balance is checked when a build
          starts, not while it runs — so this one can finish and take you to zero or below.
          <CalloutAction
            href="/dashboard/billing"
            label={canTopUp ? "Top up first" : "See your credit ledger"}
          />
        </Callout>
      )}

      {capReached && cap.cap !== null && (
        <Callout tone="danger">
          You’ve hit the spending cap you set — <span className="k-num">{cap.spent}</span> of{" "}
          <span className="k-num">{cap.cap}</span> credits in the last 30 days. Builds are refused
          until you raise or remove it.
          <CalloutAction href="/settings/credits" label="Change your cap" />
        </Callout>
      )}

      {capTight && cap.remaining !== null && (
        <Callout tone="warn">
          Your own spending cap leaves <span className="k-num">{cap.remaining}</span> credits in
          this 30-day window, which may not cover a full build.
          <CalloutAction href="/settings/credits" label="Review your cap" />
        </Callout>
      )}
    </div>
  );
}

function Callout({ tone, children }: { tone: "warn" | "danger"; children: React.ReactNode }) {
  const skin =
    tone === "danger"
      ? "border-danger/25 bg-danger-tint text-danger"
      : "border-warn/25 bg-warn-tint text-warn";
  return (
    <p
      className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs leading-relaxed ${skin}`}
    >
      {children}
    </p>
  );
}

function CalloutAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="k-focus rounded-xs font-semibold underline underline-offset-2"
    >
      {label}
    </Link>
  );
}

"use client";

import { Check } from "lucide-react";
import { LOOK_DIRECTIONS, type LookDirection } from "@/lib/wizard";

/**
 * Step 2 — six design directions, rendered entirely in CSS.
 *
 * A rendered preview of the real thing would mean six actual builds, which is
 * roughly 720-3300 credits before anyone has agreed to anything. These cost
 * nothing: each card is a gradient band straight out of lib/assets/patterns.ts,
 * the direction's own heading stack demonstrating itself, and the literal
 * hexes. No model call, no network, no waiting.
 *
 * A real fieldset/legend + radio group, not a row of aria-pressed buttons: the
 * choice is single-select, so arrow-key navigation, the "3 of 6" announcement
 * and a genuine <label> per option all come for free. Same idiom as the
 * category filter in components/templates/TemplateGallery.tsx.
 *
 * NO TEXT SITS ON A GRADIENT anywhere here. The bands are decorative and
 * aria-hidden; every word is on the card's own surface. White-on-gradient fails
 * contrast badly (1.81:1 at worst against the brand gradient) and these
 * catalogue gradients — blush and citrus especially — are lighter still.
 */
export function LookPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Pick a direction</legend>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Each one is a real palette from Kodely&apos;s asset catalogue, so your build gets these
        exact colours rather than an interpretation of an adjective. Skip it and Kodely chooses.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LOOK_DIRECTIONS.map((look) => (
          <LookCard
            key={look.id}
            look={look}
            checked={value === look.id}
            onSelect={() => onChange(look.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function LookCard({
  look,
  checked,
  onSelect,
}: {
  look: LookDirection;
  checked: boolean;
  onSelect: () => void;
}) {
  const { gradient } = look;

  return (
    // <label> only accepts phrasing content, so every wrapper below is a span
    // set to display:block rather than a div — a div here would be invalid HTML
    // even though browsers forgive it.
    <label className="block cursor-pointer">
      <input
        type="radio"
        name="wizard-look"
        value={look.id}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span className="block overflow-hidden rounded-2xl border border-black/10 bg-white/60 transition-colors hover:border-black/25 peer-checked:border-neutral-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/30 dark:peer-checked:border-white">
        {/* The border matters for the darkest presets (ink, midnight): without
            it the band is indistinguishable from the card behind it in dark
            mode and reads as a rendering fault rather than as a swatch. */}
        <span
          aria-hidden
          className="relative block h-16 border-b border-black/10 dark:border-white/10"
          style={{ backgroundImage: gradient.css }}
        >
          {checked && (
            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-neutral-900 shadow-sm">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </span>

        <span className="block p-4">
          {/* The name is set in the direction's own heading stack, so the card
              shows the typographic idea instead of only naming it. */}
          <span
            className="block text-lg leading-tight"
            style={{
              fontFamily: look.headingFont,
              fontWeight: look.headingWeight,
              letterSpacing: look.headingTracking,
            }}
          >
            {look.name}
          </span>
          <span className="mt-1.5 block text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {look.blurb}
          </span>

          <span className="mt-3 flex flex-wrap items-center gap-1.5">
            {gradient.colors.map((hex) => (
              <span
                key={hex}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 py-0.5 pl-0.5 pr-2 font-mono text-[10px] text-neutral-600 dark:border-white/10 dark:text-neutral-400"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/20"
                  style={{ background: hex }}
                />
                {hex}
              </span>
            ))}
          </span>

          <span className="mt-2.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {look.densityLabel} · {gradient.name}
          </span>
        </span>
      </span>
    </label>
  );
}

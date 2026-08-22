"use client";

import { Check } from "lucide-react";
import { paletteCatalogue, type PaletteChoice } from "@/lib/brand-kit";

/**
 * Colour, in the vocabulary the product already has.
 *
 * `lib/brand-kit.ts` turns every preset in the `GRADIENTS` catalogue into a
 * full `BrandPalette` — primary, secondary, a derived accent, and an ink /
 * surface pair chosen by WCAG contrast — and `components/wizard/LookPicker.tsx`
 * already puts those same swatches in front of customers. This is that idea at
 * modal scale: the same catalogue, the same ids, the same hexes. Inventing a
 * second colour vocabulary here (a hue wheel, six adjectives, a hex field)
 * would mean two answers to "what colour is this site" that cannot be
 * reconciled, and the build only takes one of them.
 *
 * The hexes ARE the point, so they are the one place in this feature that uses
 * raw colour values: `style` on a decorative swatch, exactly as LookPicker
 * does. No text ever sits on a band — white-on-gradient fails contrast badly
 * and the pale presets (blush, butter, arctic) fail it worst — so every word
 * here is on the card's own surface.
 */

const CHOICES: PaletteChoice[] = paletteCatalogue();

export function PalettePicker({
  value,
  onChange,
}: {
  /** Preset id, or null for "let Kodely choose". */
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Colour palette</legend>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-hair bg-surface-2/50 p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <Option
            checked={value === null}
            onSelect={() => onChange(null)}
            name="Let Kodely choose"
            detail="Reads the brief and picks"
          />
          {CHOICES.map((choice) => (
            <Option
              key={choice.id}
              checked={value === choice.id}
              onSelect={() => onChange(choice.id)}
              name={choice.name}
              detail={choice.family}
              css={choice.css}
              colors={choice.colors}
            />
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function Option({
  checked,
  onSelect,
  name,
  detail,
  css,
  colors,
}: {
  checked: boolean;
  onSelect: () => void;
  name: string;
  detail: string;
  css?: string;
  colors?: string[];
}) {
  return (
    // A <label> may only contain phrasing content, so every wrapper is a span.
    <label className="block cursor-pointer">
      <input
        type="radio"
        name="template-palette"
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span className="block overflow-hidden rounded-md border border-hair bg-surface transition-colors duration-[var(--t-1)] hover:border-line-mid peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-[var(--brand-tint)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--brand-ring)]">
        {/* The hairline matters for the darkest presets (ink, midnight): with
            no border the band is invisible against a dark surface and reads as
            a rendering fault rather than as a swatch. */}
        <span
          aria-hidden
          className="relative block h-7 border-b border-hair"
          style={css != null ? { backgroundImage: css } : undefined}
        >
          {css == null && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="k-label text-ink-3">auto</span>
            </span>
          )}
          {checked && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-surface text-ink shadow-e1">
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="block px-2 py-1.5">
          <span className="block truncate text-[0.6875rem] font-medium text-ink">{name}</span>
          <span className="block truncate text-[0.625rem] text-ink-3">
            {colors ? colors.join(" · ") : detail}
          </span>
        </span>
      </span>
    </label>
  );
}

/**
 * The prompt wizard's data model and its one real job: turning a handful of
 * answers into a PROMPT.
 *
 * ## Why this file emits text and not a config object
 *
 * The wizard's output is a plain-English prompt that lands in a textarea the
 * user can read, edit and delete half of. It is never a hidden state blob that
 * /api/generate reads. Three reasons, in order of weight:
 *
 *   1. There is exactly one build path. The raw composer is the default entry
 *      point and always will be; if the wizard emitted a config, we would have
 *      two paths to test, debug and eval, and the second one would rot.
 *   2. The user stays in control. They can see what the wizard decided on their
 *      behalf. A config object cannot offer that.
 *   3. lib/templates.ts already proves the shape. The 23 starter prompts are
 *      exactly what an expert-written wizard output looks like — audience,
 *      tone, ordered sections, bracketed placeholders, link-outs instead of
 *      forms. So the wizard's job is to help someone produce one of those, not
 *      to invent a parallel format.
 *
 * ## Zero model calls
 *
 * Everything here is local string work. /api/enhance is auth-gated and rate
 * limited per user id, and most people meeting the wizard have no account —
 * an affordance that 401s on click is worse than no affordance. So assembly is
 * synchronous, offline, and identical signed in or out.
 *
 * Enhance is deliberately NOT part of the wizard flow afterwards either. The
 * wizard's output is already a structured brief in Enhance's own house style
 * (Audience / tone / ordered sections / bracketed placeholders), and it is
 * routinely longer than lib/enhance.ts's MAX_PROMPT_CHARS — /api/enhance
 * answers exactly that case with "That's already detailed enough to build".
 * The wizard assembles; Enhance polishes a one-liner. Neither duplicates the
 * other, and neither gets to overwrite the palette the user picked.
 *
 * ## Colour is hexes, never adjectives
 *
 * "Warm and modern" is the instruction that produces the same three sites every
 * time. Every look direction below resolves to a real preset in
 * lib/assets/patterns.ts, and the emitted prompt carries that preset's id AND
 * its literal stops, plus a pointer at the find_assets tool the builder already
 * has. That makes the choice unambiguous for the model and auditable for us.
 */

import { getGradient, type GradientPreset } from "./assets/patterns";
import { PENDING_PROMPT_IMAGE_KEY, PENDING_PROMPT_KEY } from "./pending-prompt";
import {
  getTemplate,
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  type Template,
  type TemplateCategory,
} from "./templates";

// ---------------------------------------------------------------------------
// Step 1 — what and who
// ---------------------------------------------------------------------------

/**
 * The eighth chip. Not a TemplateCategory, because it deliberately maps to no
 * template — someone whose business is not on the list must not be forced to
 * claim it is.
 */
export const SOMETHING_ELSE = "Something else";

export type WizardCategory = TemplateCategory | typeof SOMETHING_ELSE;

/**
 * The chips on step 1. Annotated rather than inferred: spreading a readonly
 * tuple of literals into a fresh array widens every member to `string`, and the
 * point of this list is that the picked value is one of eight known things.
 */
export const WIZARD_CATEGORIES: readonly WizardCategory[] = [
  ...TEMPLATE_CATEGORIES,
  SOMETHING_ELSE,
];

/** Kept short on purpose: this becomes the subject of the opening sentence. */
export const MAX_NAME_CHARS = 80;
/** One line, not an essay. The composer is where a long brief belongs. */
export const MAX_WHAT_CHARS = 240;

export type WizardAnswers = {
  /** A TemplateCategory, SOMETHING_ELSE, or null while nothing is chosen. */
  category: WizardCategory | null;
  /** The closest template inside that category — the skeleton for the prompt. */
  templateId: string | null;
  businessName: string;
  whatYouDo: string;
  /** A LOOK_DIRECTIONS id, or null when step 2 was skipped. */
  lookId: string | null;
};

export const EMPTY_ANSWERS: WizardAnswers = {
  category: null,
  templateId: null,
  businessName: "",
  whatYouDo: "",
  lookId: null,
};

/** The templates a category chip should offer as "closest match". */
export function templatesForCategory(category: WizardAnswers["category"]): Template[] {
  if (!category || category === SOMETHING_ELSE) return [];
  return TEMPLATES.filter((t) => t.category === category);
}

// ---------------------------------------------------------------------------
// Step 2 — six pre-rendered design directions
// ---------------------------------------------------------------------------

/**
 * One of six directions on the look picker.
 *
 * A rendered preview here would mean a real build (120-550 credits), so these
 * are drawn purely in CSS from presets that already exist — no model call, no
 * network, instant. The user still ends up choosing concrete hexes rather than
 * an adjective, which is the part that actually matters.
 */
export type LookDirection = {
  /** Stable — it ends up in analytics and in the assembled prompt. */
  id: string;
  name: string;
  /** One line, shown on the card and repeated into the prompt. */
  blurb: string;
  /** Resolved from GRADIENTS in lib/assets/patterns.ts. */
  gradient: GradientPreset;
  /** How the typography reads, in the words the prompt will use. */
  typography: string;
  /** How much room the layout takes, in the words the prompt will use. */
  density: string;
  /** Two words for the card. Same idea as `density`, without the sentence. */
  densityLabel: string;
  /**
   * The heading stack the preview card renders its own name in, so the card
   * demonstrates the direction rather than describing it. System stacks only:
   * the sandbox CSP sets no font-src, so a generated site has no web fonts and
   * a preview promising one would be a lie.
   */
  headingFont: string;
  headingWeight: number;
  headingTracking: string;
};

type LookDef = Omit<LookDirection, "gradient"> & { gradientId: string };

// Deliberately one direction per gradient FAMILY (warm, cool, neutral, nature,
// pastel, vivid) rather than six variations on a theme — the picker's value is
// spread, not choice. Note what is absent: nothing here defaults to
// indigo/violet, which is the palette an unconstrained model reaches for
// regardless of subject.
const LOOK_DEFS: LookDef[] = [
  {
    id: "warm-rustic",
    name: "Warm and rustic",
    blurb: "Earthy and hand-made — clay tones, serif headings, room to breathe.",
    gradientId: "terracotta",
    typography:
      "serif headings from the system serif stack (ui-serif, Georgia, serif) over a plain sans body, set large and unhurried",
    density: "roomy — a long vertical rhythm, roughly one idea per screen, and generous whitespace",
    densityLabel: "Roomy",
    headingFont: "ui-serif, Georgia, serif",
    headingWeight: 600,
    headingTracking: "-0.01em",
  },
  {
    id: "clean-clinical",
    name: "Clean and clinical",
    blurb: "Orderly and precise — cool teal, tight sans type, everything on a grid.",
    gradientId: "teal-fade",
    typography:
      "the system sans throughout at tight tracking, moderate sizes, hierarchy carried by weight rather than by scale",
    density: "compact — an obvious grid, even spacing, nothing oversized",
    densityLabel: "Compact",
    headingFont: "ui-sans-serif, system-ui, sans-serif",
    headingWeight: 600,
    headingTracking: "-0.02em",
  },
  {
    id: "bold-editorial",
    name: "Bold and editorial",
    blurb: "Magazine energy — near-black, oversized headlines, hairline rules.",
    gradientId: "ink",
    typography:
      "oversized system-sans headlines at very tight tracking, hairline rules, small uppercase labels with wide letter-spacing",
    density: "spacious but high-contrast — big type, wide margins, few elements per section",
    densityLabel: "High contrast",
    headingFont: "ui-sans-serif, system-ui, sans-serif",
    headingWeight: 700,
    headingTracking: "-0.04em",
  },
  {
    id: "fresh-natural",
    name: "Fresh and natural",
    blurb: "Green and open — humanist type, soft corners, plenty of air.",
    gradientId: "forest",
    typography:
      "humanist sans at comfortable sizes with generous line height, and softly rounded corners on cards and buttons",
    density: "airy — wide gutters, soft edges, nothing pressed against an edge",
    densityLabel: "Airy",
    headingFont: "ui-sans-serif, system-ui, sans-serif",
    headingWeight: 600,
    headingTracking: "-0.015em",
  },
  {
    id: "soft-elegant",
    name: "Soft and elegant",
    blurb: "Quiet and refined — pale tones, light serif, whitespace doing the work.",
    gradientId: "blush",
    typography:
      "light serif headings (ui-serif, Georgia, serif) at restrained sizes, with small uppercase labels at wide letter-spacing",
    density: "whitespace-led — very generous margins, smaller type, nothing crowded",
    densityLabel: "Whitespace-led",
    headingFont: "ui-serif, Georgia, serif",
    headingWeight: 400,
    headingTracking: "0.01em",
  },
  {
    id: "bright-energetic",
    name: "Bright and energetic",
    blurb: "Loud and fast — lime and yellow, heavy sans, flat blocks of colour.",
    gradientId: "citrus",
    typography:
      "heavy system-sans headings with big jumps between sizes, uppercase where it earns the emphasis",
    density: "dense and punchy — flat blocks of colour, tight sections, little idle space",
    densityLabel: "Dense",
    headingFont: "ui-sans-serif, system-ui, sans-serif",
    headingWeight: 800,
    headingTracking: "-0.03em",
  },
];

/**
 * The six directions, with their gradient preset resolved.
 *
 * flatMap rather than map + `!`: a typo'd preset id drops one card instead of
 * throwing at module load and taking a marketing page down with it.
 */
export const LOOK_DIRECTIONS: LookDirection[] = LOOK_DEFS.flatMap(({ gradientId, ...rest }) => {
  const gradient = getGradient(gradientId);
  return gradient ? [{ ...rest, gradient }] : [];
});

export function getLook(id: string): LookDirection | undefined {
  return LOOK_DIRECTIONS.find((l) => l.id === id);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * The skeleton for "Something else", and for anyone who skipped step 1.
 *
 * Written in the same voice as lib/templates.ts and to the same limits, so the
 * generic path inherits the same guardrails the 23 hand-written prompts carry:
 * no backend, no fake forms, no photography, bracketed placeholders for every
 * fact only the owner knows.
 */
const GENERIC_SKELETON = `Build a one-page website for [your business name].

Audience: [who you are trying to reach]. Tone: [how you want to come across] — specific and human rather than corporate.

Sections in this order:
1. Hero — the name, one line saying what this is and who it is for, and a single primary call to action.
2. What we do — three or four short blocks, each with a heading and a line or two.
3. About — a short paragraph in a real voice about who is behind this.
4. The practical details — [your location], [your opening hours], [your prices] — laid out so they are readable at a glance.
5. Footer with contact details and [your social links].

Leave every fact you cannot know as an obvious bracketed placeholder — [your address], [your phone number], [your prices] — instead of inventing something plausible.

There is no backend, so do not build a contact, booking or signup form. The calls to action are a mailto: link to [your email], a tel: link to [your phone number], and [link to the service you already use] where one is needed.

I have no photographs to supply, so carry the design with typography, colour, texture and inline SVG rather than empty image frames. Responsive down to 380px, and include a dark mode.`;

function clean(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max).trim();
}

/** "a bakery in Leeds." -> "a bakery in Leeds" — we supply the punctuation. */
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!,;:—–-]+$/, "").trim();
}

/**
 * The first line of every starter prompt is written to stand alone as a summary
 * ("Build a one-page website for [your cafe's name], …") — TemplateCard already
 * relies on that. So it is the one line safe to rewrite with the user's own
 * facts, and doing so is what turns a template into *their* brief.
 *
 * Three cases, and none of them invents anything:
 *   - name + description : write our own opener from both.
 *   - name only          : substitute it for the first bracketed token on the
 *                          template's own first line, keeping the rest of that
 *                          line's hints ("in [your city]") intact.
 *   - neither            : leave the template's first line exactly as written.
 *
 * The name-only case has one known rough edge: the wedding template opens with
 * "[name one] and [name two]", so a name substituted there leaves a stray
 * second bracket. That is a visible bracket, not an invented fact, and the
 * review step is a textarea — the user deletes it. Preferred over a per-template
 * substitution table that would drift the moment a template is edited.
 */
function openingLine(a: WizardAnswers, skeletonFirstLine: string): string {
  const name = clean(a.businessName, MAX_NAME_CHARS);
  const what = stripTrailingPunctuation(clean(a.whatYouDo, MAX_WHAT_CHARS));

  if (what) {
    return `Build a one-page website for ${name || "[your business name]"} — ${what}.`;
  }
  if (name) {
    const substituted = skeletonFirstLine.replace(/\[[^\]]*\]/, name);
    // Only trust the substitution if it actually found a bracket.
    if (substituted !== skeletonFirstLine) return substituted;
    return `Build a one-page website for ${name}.`;
  }
  return skeletonFirstLine;
}

/**
 * The block that makes the look choice binding.
 *
 * Note what it does NOT say: no adjective stands alone. The preset id, the
 * literal stops and the angle all travel, plus an instruction to pull the exact
 * source through find_assets (which lib/agent.ts already exposes) rather than
 * improvising hexes that merely resemble the swatch the user clicked.
 */
function visualDirection(look: LookDirection): string {
  const g = look.gradient;
  return [
    "Visual direction — I chose this, so build to it rather than picking your own. Where it disagrees with a colour or type hint earlier in this brief, this wins:",
    `- Look: ${look.name}. ${look.blurb}`,
    `- Palette: ${g.id} (${g.colors.join(" to ")}, ${g.angle}deg). Use find_assets with the query "${g.id}" to pull the exact gradient source, make those the dominant colours, and derive the rest of the palette from those hexes. Do not substitute a different colour, and do not fall back to indigo or violet.`,
    `- Typography: ${look.typography}.`,
    `- Density: ${look.density}.`,
  ].join("\n");
}

/**
 * The whole wizard, as one string.
 *
 * Deterministic and synchronous: the same answers always produce the same
 * prompt, which is what makes the paired eval fixtures on the board possible
 * later, and what lets the review step re-derive the text after an edit is
 * reverted.
 */
export function assemblePrompt(a: WizardAnswers): string {
  const template = a.templateId ? getTemplate(a.templateId) : undefined;
  const skeleton = template?.prompt ?? GENERIC_SKELETON;

  const lines = skeleton.split("\n");
  const first = lines[0] ?? "";
  const body = lines.slice(1).join("\n").trim();

  const look = a.lookId ? getLook(a.lookId) : undefined;

  return [openingLine(a, first), body, look ? visualDirection(look) : ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** True once there is anything in the prompt beyond the untouched skeleton. */
export function hasAnswers(a: WizardAnswers): boolean {
  return Boolean(
    a.category || a.templateId || a.lookId || a.businessName.trim() || a.whatYouDo.trim(),
  );
}

// ---------------------------------------------------------------------------
// Carrying the prompt through the auth wall
// ---------------------------------------------------------------------------

/**
 * A hard ceiling on what the wizard is allowed to put into sessionStorage.
 *
 * sessionStorage is roughly 5MB per origin and lib/pending-prompt.ts already
 * spends a chunk of it on a downscaled reference image. An assembled prompt is
 * 1.5-3KB, so this cap is nowhere near binding today — it exists so that the
 * budget is a decision rather than an accident when the deferred brand step
 * (logo, pasted site content) starts wanting room next to it. Anything over the
 * cap is truncated rather than dropped: losing what someone told us at the auth
 * wall is the exact failure destinationAfterAuth() exists to prevent.
 */
export const MAX_CARRIED_PROMPT_CHARS = 12_000;

/**
 * Hand the prompt to the existing pending-prompt mechanism — the same one the
 * home-page composer and the template gallery use. Deliberately not a second
 * route into a build: signup and login already show the pending prompt back,
 * their submit handlers already call destinationAfterAuth(), and the project
 * Editor already picks it up on mount.
 *
 * Returns false if storage is unavailable (private mode, blocked cookies) so
 * the caller can say so instead of navigating into an empty composer.
 */
export function stashPrompt(prompt: string): boolean {
  const text = prompt.trim().slice(0, MAX_CARRIED_PROMPT_CHARS);
  if (!text) return false;
  try {
    sessionStorage.setItem(PENDING_PROMPT_KEY, text);
    // A reference image attached on the home page earlier in this session would
    // otherwise ride along into a build that never asked for one. The wizard
    // has no image path of its own yet (the logo / reference-screenshot step is
    // deliberately not built), so it always clears this.
    sessionStorage.removeItem(PENDING_PROMPT_IMAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

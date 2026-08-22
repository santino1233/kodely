/**
 * The inline wizard's answers, and the one job that matters: turning them into
 * a build PROMPT.
 *
 * ## Why this reuses lib/wizard.ts instead of restating it
 *
 * `assemblePrompt` already does the hard half — it picks the starter brief out
 * of lib/templates.ts, rewrites its opening line with the customer's own words,
 * and appends the look block with literal hexes rather than adjectives. That
 * logic is exported, it is what the public /wizard ships, and there is no
 * version of "two prompt assemblers that must agree" that stays true for long.
 * So this module calls it and then appends what the five inline stages know
 * that the four public ones do not: the business's real details, the chosen
 * tone, the type/density overrides, the feature fragments, and the logo note.
 *
 * `clean()` and `stripTrailingPunctuation()` in lib/wizard.ts are private, so
 * the small copies below are deliberate — that file belongs to another owner
 * and is not mine to widen.
 *
 * ## Order matters, once
 *
 * The look block ends `assemblePrompt`'s output and says in so many words that
 * it beats any colour or type hint EARLIER in the brief. The typography and
 * density overrides therefore have to come after it, and they say out loud that
 * they are overrides. Everything else is additive and its position is only a
 * readability decision.
 *
 * ## Nothing is invented, and nothing is required
 *
 * Every field is optional and every blank one simply produces no line. The
 * facts block ends by restating the rule the model already has: anything not
 * listed stays a bracketed placeholder. That is the whole reason it is safe to
 * ask a customer for their phone number in a wizard — an unanswered question
 * costs a placeholder, never an invention.
 */

import {
  assemblePrompt,
  MAX_NAME_CHARS,
  type WizardAnswers,
  type WizardCategory,
} from "@/lib/wizard";
import { featuresFragment } from "@/lib/features";

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

/** Room for a real answer, not for an essay — the composer is where a long
 *  brief belongs, and stage 5 is a textarea they can paste one into. */
export const LIMITS = {
  describe: 800,
  businessName: MAX_NAME_CHARS,
  location: 90,
  offerings: 400,
  email: 120,
  phone: 40,
  hours: 260,
  links: 260,
} as const;

/**
 * What a first build usually costs, as a RANGE.
 *
 * Mirrors `estimateCredits("create")` in lib/credits.ts, which cannot be
 * imported here: that module's first line pulls in Prisma, and this component
 * runs in the browser. The public wizard gets the same numbers from the server
 * through a prop; the inline wizard's interface has no such prop, so this is
 * the copy. If lib/credits.ts changes, change this.
 */
export const CREATE_CREDIT_ESTIMATE = { low: 120, high: 550 } as const;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type ToneId = "warm" | "calm" | "bold" | "premium" | "playful" | "plain";

export type TypeFeel = "look" | "sans" | "serif";
export type DensityFeel = "look" | "roomy" | "compact";

export type InlineLogo = {
  /** `data:image/png;base64,…` — see prepareLogo in ./inline-logo.ts. */
  dataUrl: string;
  name: string;
  bytes: number;
};

export type InlineAnswers = {
  // Stage 1 — describe
  describe: string;
  category: WizardCategory | null;
  templateId: string | null;
  // Stage 2 — site details
  businessName: string;
  location: string;
  offerings: string;
  email: string;
  phone: string;
  hours: string;
  links: string;
  // Stage 3 — style and layout
  lookId: string | null;
  tone: ToneId | null;
  typeFeel: TypeFeel;
  density: DensityFeel;
  logo: InlineLogo | null;
  // Stage 4 — features
  featureIds: string[];
};

export const EMPTY_INLINE_ANSWERS: InlineAnswers = {
  describe: "",
  category: null,
  templateId: null,
  businessName: "",
  location: "",
  offerings: "",
  email: "",
  phone: "",
  hours: "",
  links: "",
  lookId: null,
  tone: null,
  typeFeel: "look",
  density: "look",
  logo: null,
  featureIds: [],
};

export const TONES: { id: ToneId; label: string; phrase: string }[] = [
  {
    id: "warm",
    label: "Warm and friendly",
    phrase: "warm and friendly — write the way you would talk to a regular, never corporate",
  },
  {
    id: "calm",
    label: "Calm and understated",
    phrase: "calm and understated — short sentences, no exclamation marks, nothing oversold",
  },
  {
    id: "bold",
    label: "Bold and confident",
    phrase: "bold and confident — short declarative lines, a clear point of view, no hedging",
  },
  {
    id: "premium",
    label: "Premium and refined",
    phrase:
      "premium and refined — restrained and precise, letting the specifics persuade rather than the adjectives",
  },
  {
    id: "playful",
    label: "Playful",
    phrase: "playful and a little funny, without becoming twee or burying the useful information",
  },
  {
    id: "plain",
    label: "Straightforward",
    phrase:
      "straightforward and practical — say what it is, what it costs and how to get it, in plain words",
  },
];

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

/**
 * Drop control characters, optionally keeping line breaks.
 *
 * Written as a loop rather than a character-class regex for the reason
 * lib/brand-kit.ts's stripControls() spells out: a regex literal containing
 * control escapes trips `no-control-regex`, and an eslint-disable for a rule
 * that may not be enabled is itself reported as an unused directive.
 */
function stripControls(value: string, keepBreaks: boolean): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x0a) {
      out += keepBreaks ? "\n" : " ";
      continue;
    }
    if (code === 0x09 || code === 0x0d) {
      out += " ";
      continue;
    }
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

/**
 * A single-line answer, safe to interpolate into a brief.
 *
 * Line breaks are flattened rather than trimmed: these values land inside a
 * prompt whose structure IS its line breaks, and a value carrying its own could
 * restructure the sections around it. Same reasoning as cleanBusinessName() in
 * lib/brand-kit.ts.
 */
function oneLine(value: string, max: number): string {
  return stripControls(value, false).replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** A multi-line answer as a list: breaks survive, blank lines collapse, and a
 *  trailing separator on a line is dropped so "eggs," reads as "eggs". */
function listOf(value: string, max: number, maxItems = 12): string[] {
  return stripControls(value, true)
    .slice(0, max)
    .split("\n")
    .map((item) => item.replace(/\s+/g, " ").trim().replace(/[;,]+$/, "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

/** "a bakery in Leeds." -> "a bakery in Leeds" — the opener supplies its own
 *  punctuation. Copied from lib/wizard.ts, which does not export it. */
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!,;:—–-]+$/, "").trim();
}

/**
 * Split a description into "the bit the opening sentence can carry" and "the
 * rest", so nothing is repeated and nothing is silently lost.
 *
 * The clean split is a sentence boundary inside the first `max` characters —
 * that is the common case, because people answer "what are you building?" with
 * a sentence and then keep going. When there is no sentence end in range (one
 * very long run-on), the opener falls back to a word-boundary cut and `rest`
 * is the WHOLE text: repeating a clause is a much smaller failure than dropping
 * the second half of what somebody wrote.
 */
function splitDescription(value: string, max: number): { opener: string; rest: string } {
  if (value.length <= max) return { opener: value, rest: "" };

  const window = value.slice(0, max);
  const stop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (stop > 0) {
    return { opener: window.slice(0, stop + 1).trim(), rest: value.slice(stop + 2).trim() };
  }

  const space = window.lastIndexOf(" ");
  return {
    opener: (space > max * 0.5 ? window.slice(0, space) : window).trim(),
    rest: value,
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * How much of the stage-1 description the opening sentence can carry.
 *
 * lib/wizard.ts caps `whatYouDo` at 240 characters because it becomes the tail
 * of a single sentence ("Build a one-page website for X — <this>."). Stage 1
 * lets someone write considerably more than that, so this sits comfortably
 * under the cap and everything past it goes into its own block.
 */
const OPENER_MAX = 190;

/** The opening line's subject, and the remainder that did not fit in it. */
function describeParts(describe: string): { opener: string; rest: string } {
  const clean = oneLine(describe, LIMITS.describe);
  if (!clean) return { opener: "", rest: "" };
  const split = splitDescription(clean, OPENER_MAX);
  return { opener: stripTrailingPunctuation(split.opener), rest: split.rest };
}

function ownWordsBlock(rest: string): string {
  if (!rest) return "";
  return `More about this business, in the owner's own words — treat this as the source of truth for what the site is for:\n${rest}`;
}

function factsBlock(a: InlineAnswers): string {
  const rows: string[] = [];
  const name = oneLine(a.businessName, LIMITS.businessName);
  const location = oneLine(a.location, LIMITS.location);
  const email = oneLine(a.email, LIMITS.email);
  const phone = oneLine(a.phone, LIMITS.phone);
  const offerings = listOf(a.offerings, LIMITS.offerings);
  const hours = listOf(a.hours, LIMITS.hours, 8);
  const links = listOf(a.links, LIMITS.links, 8);

  if (name) rows.push(`- Name, spelled and capitalised exactly like this: ${name}`);
  if (location) rows.push(`- Where it is: ${location}`);
  if (offerings.length > 0) rows.push(`- What it offers: ${offerings.join("; ")}`);
  if (email) rows.push(`- Email address for enquiries: ${email}`);
  if (phone) rows.push(`- Phone number: ${phone}`);
  if (hours.length > 0) rows.push(`- Opening hours: ${hours.join(" · ")}`);
  if (links.length > 0) rows.push(`- Links to use: ${links.join(" · ")}`);

  if (rows.length === 0) return "";

  return [
    "These are the real details for this business. Use them exactly as written — in the copy, in the <title>, in the meta description and in every call to action. Anything NOT in this list is something you do not know: leave it as an obvious bracketed placeholder such as [your address] rather than inventing a plausible-looking value.",
    ...rows,
  ].join("\n");
}

/**
 * Named as a replacement rather than an addition.
 *
 * Every starter brief carries its own "Tone:" line — a bracketed placeholder in
 * the generic skeleton, and a fully-written sentence in most of the 23
 * templates. Silently adding a second opinion beside either one leaves the
 * model to choose, and leaves a bracket on a live page in the first case. So
 * this says which one wins without assuming which kind it is beating.
 */
function toneBlock(tone: ToneId | null): string {
  const match = TONES.find((t) => t.id === tone);
  if (!match) return "";
  return `Tone of voice for every word on the page. This replaces the "Tone:" line near the top of the brief, whether that line is a placeholder or already filled in — resolve it rather than writing to both: ${match.phrase}.`;
}

/**
 * Typography and density overrides.
 *
 * Placed after `assemblePrompt`'s look block on purpose — that block claims
 * precedence over hints EARLIER in the brief, so anything meant to beat it has
 * to come later and say that it is an override.
 */
function overridesBlock(a: InlineAnswers): string {
  const rows: string[] = [];
  if (a.typeFeel === "sans") {
    rows.push(
      "- Typography: the system sans stack throughout (ui-sans-serif, system-ui, sans-serif). No serif headings — carry the hierarchy with weight and size.",
    );
  }
  if (a.typeFeel === "serif") {
    rows.push(
      "- Typography: serif headings from the system serif stack (ui-serif, Georgia, serif) over a plain sans body. Remember there are no web fonts of any kind — the CSP allows none, base64 included.",
    );
  }
  if (a.density === "roomy") {
    rows.push(
      "- Density: roomy. A long vertical rhythm, roughly one idea per screen, generous whitespace, nothing crowded.",
    );
  }
  if (a.density === "compact") {
    rows.push(
      "- Density: compact. An obvious grid, even spacing, moderate type sizes, little idle space.",
    );
  }
  if (rows.length === 0) return "";
  return [
    "Adjustments that override the visual direction above wherever the two disagree:",
    ...rows,
  ].join("\n");
}

/**
 * What the attached logo actually is, said honestly.
 *
 * The image reaches the model as vision input (app/api/generate/route.ts hands
 * it to lib/agent.ts, which labels it "visual/style guidance"). It is never
 * written into a file, and a generated site has no way to carry it: there is no
 * upload, and img-src allows only 'self' and data:. So the brief asks for a
 * marked space rather than for the logo, and the UI says the same thing.
 */
function logoBlock(a: InlineAnswers): string {
  if (!a.logo) return "";
  return [
    "I have attached my logo as the reference image for this build. Use it for the brand's colours, weight and general character, and pull the palette towards it wherever that does not fight the visual direction above.",
    "Do NOT try to redraw the logo as SVG and do not reference the image file: you cannot embed it, and an approximation of somebody's logo is worse than none. In the header and the footer, leave a correctly-sized, clearly-bracketed [your logo] slot with the business name set in type beside it, so the space is ready for the real file.",
  ].join(" ");
}

/**
 * Everything, as one string. Deterministic: the same answers always produce the
 * same prompt, which is what lets stage 5's Revert re-derive the text after an
 * edit is thrown away.
 */
export function assembleInlineBrief(a: InlineAnswers): string {
  const described = describeParts(a.describe);
  const base: WizardAnswers = {
    category: a.category,
    templateId: a.templateId,
    businessName: oneLine(a.businessName, LIMITS.businessName),
    whatYouDo: described.opener,
    lookId: a.lookId,
  };

  return [
    assemblePrompt(base),
    overridesBlock(a),
    toneBlock(a.tone),
    ownWordsBlock(described.rest),
    factsBlock(a),
    featuresFragment(a.featureIds),
    logoBlock(a),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** True once the customer has told us anything at all. Drives the "go straight
 *  to the prompt" affordance and nothing else. */
export function hasInlineAnswers(a: InlineAnswers): boolean {
  return Boolean(
    a.describe.trim() ||
      a.category ||
      a.templateId ||
      a.businessName.trim() ||
      a.location.trim() ||
      a.offerings.trim() ||
      a.email.trim() ||
      a.phone.trim() ||
      a.hours.trim() ||
      a.links.trim() ||
      a.lookId ||
      a.tone ||
      a.typeFeel !== "look" ||
      a.density !== "look" ||
      a.logo ||
      a.featureIds.length > 0,
  );
}

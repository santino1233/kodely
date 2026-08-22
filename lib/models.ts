// Model router + rate card.
//
// Kodely's #1 existential risk is unit economics (the LLM "token tax"), so the
// model choice is a product decision, not a default: Sonnet 5 is the codegen
// workhorse and Opus 5 is available for planning / hard repairs. Both are
// overridable per-environment so we can retune without a code change.

// Why Sonnet 5 and not Opus 5: on coding and agentic work Sonnet 5 lands close
// enough to Opus that the difference does not show up in a static marketing
// site, while costing $3/$15 per MTok against Opus 5's $5/$25. Haiku 4.5 is
// cheaper still but design quality is the product, so that is the wrong saving.
export const MODELS = {
  /** Writes and edits the site. Handles the overwhelming majority of builds. */
  builder: process.env.KODELY_MODEL_BUILDER ?? "claude-sonnet-5",
  /** Reserved for planning and repair of builds the workhorse couldn't fix. */
  planner: process.env.KODELY_MODEL_PLANNER ?? "claude-opus-5",
  /**
   * Expands a one-line prompt into an editable spec (lib/enhance.ts). This is
   * a few hundred words of prose, not code and not a design problem, so the
   * "design quality is the product" argument for Sonnet does not apply — Haiku
   * is a third of the price and the user edits the result anyway. Enhance is
   * also unbilled, so it comes straight off margin: the cheap model is the
   * only one that makes the feature free to offer.
   */
  enhancer: process.env.KODELY_MODEL_ENHANCER ?? "claude-haiku-4-5",
} as const;

// Effort moves spend more than the model choice does — Sonnet 5 at `medium` is
// roughly Sonnet 4.6 at `high`. A blank-page first build is a genuine design
// problem and earns `high`; a targeted tweak does not.
export const EFFORT = {
  create: (process.env.KODELY_EFFORT_CREATE ?? "high") as "high",
  edit: (process.env.KODELY_EFFORT_EDIT ?? "medium") as "medium",
} as const;

/** USD per million tokens. Used to meter real spend per build. */
export const MODEL_RATES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // Conservative fallback so an unknown model can never under-bill us.
  default: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

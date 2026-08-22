/**
 * Where each asset in the catalogue came from, and under what licence.
 *
 * ── READ THIS BEFORE TRUSTING ANYTHING BELOW ──────────────────────────────
 *
 * THE CATALOGUE DOES NOT RECORD PROVENANCE PER ASSET. There is no `source`,
 * `licence`, `author` or `url` field on an `Icon`, a `Flag`, a `GradientPreset`
 * or any other entry — see the type definitions in ./icons.ts, ./flags.ts,
 * ./patterns.ts and ./illustrations.ts. What exists instead is a PROSE CLAIM in
 * each module's file header, made once for the whole module.
 *
 * This file transcribes those claims into data so a UI can render them in a
 * column instead of a footnote. It invents nothing: every `claim` string below
 * is quoted or tightly paraphrased from the header of the module named in
 * `module`, and `confidence` says whether that header states provenance
 * explicitly or whether it has to be read out of an adjacent statement.
 *
 * A transcription is NOT a per-asset record, and the difference matters
 * legally. docs/research/asset-sources.md §5 names "keep a provenance record
 * per asset per site — source, id, licence text, author, URL, timestamp" as a
 * mitigation to put in front of a lawyer. Nothing here does that. What this
 * file supports is the weaker and currently true statement: "every asset of
 * this kind is claimed, at module level, to be X". The moment a single
 * third-party asset is vendored into any of those modules, the claim becomes
 * false for the whole module and this representation stops being adequate —
 * which is exactly when a real per-asset field has to exist. {@link
 * PROVENANCE_GAP} states that in the UI rather than leaving it here.
 *
 * WHY NOT A DATABASE TABLE. The catalogue is code, not rows: every asset is a
 * literal in a `.ts` file, and its provenance is a property of that literal.
 * A Prisma model would be a second copy of the same fact, free to drift from
 * the file it describes, and it would need seeding on every deploy to say
 * anything at all. When assets start arriving from Pixabay/Pexels at build time
 * (docs/research/asset-sources.md §4) those are per-site, per-build records with
 * timestamps and remote ids — that IS a table, and it is a different one from
 * this.
 */

import type { AssetKind } from "./index";

/**
 * How well evidenced a provenance claim is.
 *
 *  - "declared" — the module header states its provenance in as many words,
 *    under its own PROVENANCE heading.
 *  - "inferred" — the header describes how the asset is produced ("generated
 *    from arithmetic") but never states that nothing was copied from a
 *    third-party source. The conclusion follows, but nobody wrote it down.
 *
 * The distinction is kept because collapsing it would make the weaker case
 * look like the stronger one, and the weaker case is the one worth fixing.
 */
export type ProvenanceConfidence = "declared" | "inferred";

export type SourceProvenance = {
  /** Stable key, used to group the table. */
  id: string;
  /** The file that makes the claim. Shown so an operator can go read it. */
  module: string;
  /** One line: where the bytes actually come from. */
  origin: string;
  /** Full licence position. */
  licence: string;
  /** Two or three words for a dense table cell. */
  licenceShort: string;
  confidence: ProvenanceConfidence;
  /** Quoted or tightly paraphrased from the module header. */
  claim: string;
  /** What the claim does not cover. Never empty for a reason. */
  caveats: string[];
};

const ICONS_PROVENANCE: SourceProvenance = {
  id: "icons",
  module: "lib/assets/icons.ts",
  origin: "Hand-authored geometry on a 24×24 grid",
  licence: "No licence — original work, nothing third-party to licence",
  licenceShort: "None (original)",
  confidence: "declared",
  claim:
    "Every path is hand-authored geometry: primitives laid out on a 24x24 grid. No path data was copied from any icon library, free or licensed.",
  caveats: [
    "The 10 icons in the `social` category are deliberately simplified, generic renderings — not the trademark artwork. Copyright-clean, trademark-loaded: a site using them commercially should check the platform's own brand guidelines. docs/research/asset-sources.md makes the same point about brand marks in every third-party set it reviewed.",
    "One geometry, three stroke weights. The weight is a render-time argument, not a second drawing, so \"style\" is not a property an icon carries.",
  ],
};

const FLAGS_PROVENANCE: SourceProvenance = {
  id: "flags",
  module: "lib/assets/flags.ts",
  origin:
    "Emoji derived arithmetically from ISO 3166-1 codes; the SVG subset hand-authored from published construction specifications",
  licence: "No licence — flag construction sheets are not copyrightable subject matter",
  licenceShort: "None (original)",
  confidence: "declared",
  claim:
    "All geometry is generated from arithmetic in this file — band rects, star/crescent/chakra generators — or hand-authored from published public-domain specifications. No path data was copied from a flag library.",
  caveats: [
    "195 of 250 countries resolve to an emoji, not a drawing. Emoji are text: Windows Chrome/Edge render regional-indicator pairs as two grey letter boxes rather than a flag.",
    "11 of the 55 hand-authored SVGs are marked `simplified` — a recognisable rendering that knowingly omits an emblem or a counterchange. Each carries its own note.",
    "Canvas aspect ratio is normalised to 3:2 except where the proportion is part of the flag's identity, so for a handful of countries it differs from the official ratio.",
  ],
};

const PATTERNS_PROVENANCE: SourceProvenance = {
  id: "patterns",
  module: "lib/assets/patterns.ts",
  origin: "Generated: CSS gradient arithmetic, and SVG computed from arithmetic",
  licence: "No licence — nothing third-party is involved in producing them",
  licenceShort: "None (generated)",
  confidence: "inferred",
  claim:
    "Everything in this module is either pure CSS or SVG generated from arithmetic — no binary asset, no network request, and nothing that can silently fail at serve time.",
  caveats: [
    "This module's header does NOT carry the explicit \"nothing was copied from any library\" statement that icons.ts and illustrations.ts do. The conclusion follows from \"generated from arithmetic\", but it is inferred, not declared — the one provenance claim in the catalogue that nobody wrote down.",
    "The gradient palette is a curated set of hex pairs. Colour values are not copyrightable, so this changes nothing legally; it is noted because a curated list is the kind of thing that looks copied even when it is not.",
  ],
};

const ILLUSTRATIONS_PROVENANCE: SourceProvenance = {
  id: "illustrations",
  module: "lib/assets/illustrations.ts",
  origin: "Hand-placed primitives on a 120-unit grid, plus paths computed from a seeded PRNG",
  licence: "No licence — original work, explicitly stated",
  licenceShort: "None (original)",
  confidence: "declared",
  claim:
    "Every coordinate in this file is original work. No path data, no shape, and no parameter set was copied, traced or adapted from any icon set, illustration pack, CSS library or template, free or licensed. These assets are inlined into customers' commercial sites, so anything with a licence attached would become their problem; nothing here has one.",
  caveats: [
    "The strongest claim in the catalogue, and the one whose reasoning is written down in full — it is the model the other three should match.",
  ],
};

export const ASSET_PROVENANCE: SourceProvenance[] = [
  ICONS_PROVENANCE,
  FLAGS_PROVENANCE,
  PATTERNS_PROVENANCE,
  ILLUSTRATIONS_PROVENANCE,
];

/**
 * Which module each kind comes from. Keyed by the union, so a new AssetKind is
 * a type error here rather than a blank licence cell — the same enforcement
 * ADMIN_ACTION_INFO uses in lib/admin-audit.ts, and for the same reason: a
 * missing provenance entry must not be able to render as an empty column.
 */
const BY_KIND: Record<AssetKind, SourceProvenance> = {
  icon: ICONS_PROVENANCE,
  flag: FLAGS_PROVENANCE,
  gradient: PATTERNS_PROVENANCE,
  mesh: PATTERNS_PROVENANCE,
  texture: PATTERNS_PROVENANCE,
  divider: PATTERNS_PROVENANCE,
  pattern: PATTERNS_PROVENANCE,
  avatar: PATTERNS_PROVENANCE,
  backdrop: ILLUSTRATIONS_PROVENANCE,
  illustration: ILLUSTRATIONS_PROVENANCE,
  mark: ILLUSTRATIONS_PROVENANCE,
  "empty-state": ILLUSTRATIONS_PROVENANCE,
};

export function provenanceForKind(kind: AssetKind): SourceProvenance {
  return BY_KIND[kind];
}

/**
 * The structural gap, as one paragraph a UI can render verbatim.
 *
 * Held here rather than written into a page so that the page cannot quietly
 * soften it, and so a second surface reading the catalogue gets the same
 * sentence.
 */
export const PROVENANCE_GAP =
  "No asset in this catalogue carries its own provenance. There is no source, licence, author or URL field on any entry — the licence column on this page is a per-MODULE claim, transcribed from the header comment of the file each kind lives in, applied to every asset in that file. It is true today only because every asset is in-house work; it would keep rendering the same reassuring text on the day someone vendors a third-party SVG into one of those files.";

/**
 * What has to exist before anything third-party can be added. Rendered as a
 * list rather than prose because it is a work order, not a caveat.
 */
export const PROVENANCE_REQUIREMENTS = [
  "A per-asset record — source, upstream id, licence text, author, URL, retrieved-at — not a per-module claim (docs/research/asset-sources.md §5, mitigation 2).",
  "A licence field the build agent's tool output can carry, so an attribution-required asset cannot be placed silently.",
  "A brand/trademark flag, so logo-like marks are excluded from anything the model places autonomously (§3, iconoop).",
];

/**
 * The asset library's front door: one catalogue and one query function over
 * every inlinable asset Kodely can hand a generated site.
 *
 * THE SEAM
 * {@link findAssets} is deliberately shaped like a tool call. A future agent
 * tool ("search_assets") should be able to forward its arguments straight
 * through and hand the model back `AssetMatch[]` — each match already carries
 * a paste-ready `source` and a one-line `usage`, so the model never has to
 * invent SVG geometry or guess at a CSS incantation. Wiring that tool into
 * lib/agent.ts is not this module's job; being callable from it is.
 *
 * WHY EVERY MATCH IS INLINABLE
 * Generated sites run under `default-src 'self'; img-src 'self' data:;
 * connect-src 'none'` with no way to add npm packages, so a hosted asset —
 * however convenient — would fail silently at serve time. Every `source`
 * string here is either markup, CSS, or a `data:` URI, all of which survive
 * that sandbox. See the header comments in ./icons.ts and ./patterns.ts.
 *
 * WHAT IS DELIBERATELY ABSENT
 * Photography. Not "not yet" — there is no host to serve it from, and a base64
 * raster would cost more in model context than the rest of a build. Where a
 * site would reach for a stock photo it gets ./illustrations.ts instead:
 * generated hero backdrops, flat spot drawings, decorative marks and
 * empty-state art, all of it geometry.
 */

import {
  ICONS,
  iconCategories,
  iconDataUri,
  iconJsx,
  iconSvg,
  toJsx,
  type Icon,
  type IconWeight,
} from "./icons";
import { FLAGS, flagSvg, type Flag } from "./flags";
import {
  DIVIDERS,
  GRADIENTS,
  MESHES,
  PATTERNS,
  TEXTURES,
  avatarColors,
  dividerSvg,
  initialsAvatarSvg,
  initialsOf,
} from "./patterns";
import {
  BACKDROPS,
  EMPTY_STATES,
  MARKS,
  SPOTS,
  backdropSvg,
  emptyStateSvg,
  illustrationDataUri,
  illustrationJsx,
  markSvg,
  spotSvg,
} from "./illustrations";

export type AssetKind =
  | "icon"
  | "flag"
  | "gradient"
  | "mesh"
  | "texture"
  | "divider"
  | "pattern"
  | "avatar"
  | "backdrop"
  | "illustration"
  | "mark"
  | "empty-state";

export const ASSET_KINDS: AssetKind[] = [
  "icon",
  "flag",
  "gradient",
  "mesh",
  "texture",
  "divider",
  "pattern",
  "avatar",
  "backdrop",
  "illustration",
  "mark",
  "empty-state",
];

export type AssetMatch = {
  /** Stable, namespaced: "icon:phone", "flag:fr", "gradient:sunset". */
  id: string;
  kind: AssetKind;
  name: string;
  keywords: string[];
  format: "jsx" | "svg" | "css" | "text";
  /** The thing to paste into the generated site. */
  source: string;
  /** One line telling the caller where this goes. */
  usage: string;
  /** Alternative representations — raw svg, data URI, Tailwind class, colours. */
  variants?: Record<string, string>;
  /** Relevance for the query that produced this. 0 when listed rather than searched. */
  score: number;
};

export type FindAssetsOptions = {
  /** Restrict to one or more kinds. Omit for everything. */
  kind?: AssetKind | AssetKind[];
  /** Default 20, capped at 100. */
  limit?: number;
  /** Icon stroke weight for the emitted `source`. Default "regular". */
  weight?: IconWeight;
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

type Rendered = Pick<AssetMatch, "format" | "source" | "usage" | "variants">;

type Entry = {
  id: string;
  kind: AssetKind;
  name: string;
  /** Lowercased, de-duplicated search terms. */
  keywords: string[];
  render: (opts: FindAssetsOptions) => Rendered;
};

function iconEntry(icon: Icon): Entry {
  return {
    id: `icon:${icon.id}`,
    kind: "icon",
    name: icon.name,
    keywords: icon.keywords,
    render: (opts) => ({
      format: "jsx",
      source: iconJsx(icon.id, { weight: opts.weight ?? "regular", size: null, className: "h-6 w-6" }) ?? "",
      usage:
        "Paste inline into a .tsx file. Stroke is currentColor, so set the colour with a Tailwind text-* class on the icon or its parent; size with h-*/w-*.",
      variants: {
        svg: iconSvg(icon.id, { weight: opts.weight ?? "regular" }) ?? "",
        dataUri: iconDataUri(icon.id, { weight: opts.weight ?? "regular" }) ?? "",
        category: icon.category,
      },
    }),
  };
}

// Adjectival forms, as a KEYWORD on the country itself rather than a
// query-side synonym.
//
// Why it has to be entry-side: flag keywords are derived from the country
// name, so "French Guiana" owns the literal token "french" and scored a full
// keyword hit, while France could only be reached through a synonym — which is
// deliberately discounted, and is only consulted when the literal token scores
// zero. "french flag" therefore returned French Guiana, French Polynesia and
// French Southern Territories, and not France. Same for "british" (British
// Indian Ocean Territory) and "american" (American Samoa).
//
// Listing the demonym here lets the sovereign country match the same token at
// the same strength. Territory searches still work, because "french guiana"
// carries a second token that only the territory matches.
const DEMONYMS: Record<string, string[]> = {
  fr: ["french"],
  de: ["german", "deutsch"],
  es: ["spanish"],
  nl: ["dutch", "holland"],
  ch: ["swiss"],
  gr: ["greek"],
  dk: ["danish"],
  se: ["swedish"],
  no: ["norwegian"],
  fi: ["finnish"],
  pl: ["polish"],
  tr: ["turkish"],
  gb: ["british", "britain", "english", "uk"],
  ie: ["irish"],
  us: ["american", "usa", "america"],
  ca: ["canadian"],
  mx: ["mexican"],
  br: ["brazilian"],
  ar: ["argentine", "argentinian"],
  cn: ["chinese"],
  jp: ["japanese"],
  kr: ["korean"],
  in: ["indian"],
  au: ["australian"],
  it: ["italian"],
  pt: ["portuguese"],
  be: ["belgian"],
  at: ["austrian"],
  cz: ["czech"],
  ru: ["russian"],
  ua: ["ukrainian"],
  za: ["african"],
  nz: ["zealander", "kiwi"],
};

function flagEntry(flag: Flag): Entry {
  const kw = [
    flag.code,
    ...flag.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    ...(DEMONYMS[flag.code] ?? []),
    "flag",
    "country",
    "nation",
    ...(flag.svg ? ["svg"] : ["emoji"]),
  ];
  return {
    id: `flag:${flag.code}`,
    kind: "flag",
    name: flag.name,
    keywords: kw,
    render: (): Rendered => {
      const svg = flag.svg ? flagSvg(flag.code, { width: 60 }) : null;
      if (svg) {
        return {
          format: "jsx",
          source: toJsx(svg),
          usage:
            flag.svg?.accuracy === "simplified"
              ? `Hand-authored SVG, JSX-ready. SIMPLIFIED: ${flag.svg.note ?? "detail omitted"} — use the emoji instead if exactness matters.`
              : "Hand-authored SVG, JSX-ready and accurate to the flag's construction. Paste inline into a .tsx file.",
          variants: { emoji: flag.emoji, code: flag.code, accuracy: flag.svg?.accuracy ?? "", svg },
        };
      }
      return {
        format: "text",
        source: flag.emoji,
        usage:
          "Emoji flag — plain text, works with no asset at all. Note that Windows Chrome/Edge render these as two letter boxes, not a flag.",
        variants: { code: flag.code },
      };
    },
  };
}

function buildCatalog(): Entry[] {
  const entries: Entry[] = [];

  for (const icon of ICONS) entries.push(iconEntry(icon));
  for (const flag of FLAGS) entries.push(flagEntry(flag));

  for (const g of GRADIENTS) {
    entries.push({
      id: `gradient:${g.id}`,
      kind: "gradient",
      name: g.name,
      keywords: g.keywords,
      render: () => ({
        format: "css",
        source: `background-image: ${g.css};`,
        usage: `Tailwind: className="${g.tailwind}". Or set background-image in a style block. Colours: ${g.colors.join(", ")}.`,
        variants: { tailwind: g.tailwind, gradient: g.css, colors: g.colors.join(","), family: g.family },
      }),
    });
  }

  for (const m of MESHES) {
    entries.push({
      id: `mesh:${m.id}`,
      kind: "mesh",
      name: m.name,
      keywords: m.keywords,
      render: () => ({
        format: "css",
        source: `background-color: ${m.base}; background-image: ${m.css};`,
        usage: "A layered radial-gradient background. Put it on the section itself; it scales to any viewport with no image.",
        variants: { base: m.base, image: m.css },
      }),
    });
  }

  for (const t of TEXTURES) {
    entries.push({
      id: `texture:${t.id}`,
      kind: "texture",
      name: t.name,
      keywords: t.keywords,
      render: () => ({ format: "css", source: t.css, usage: t.note }),
    });
  }

  for (const d of DIVIDERS) {
    entries.push({
      id: `divider:${d.id}`,
      kind: "divider",
      name: d.name,
      keywords: d.keywords,
      render: () => ({
        format: "jsx",
        source: toJsx(dividerSvg(d.id, { fill: "currentColor", height: 90 }) ?? ""),
        usage:
          "Place it as the last child of a section. Colour it with a text-* class matching the NEXT section's background so the shape reads as that section pushing up into this one.",
        variants: {
          path: d.d,
          flipped: toJsx(dividerSvg(d.id, { fill: "currentColor", flipY: true }) ?? ""),
        },
      }),
    });
  }

  for (const p of PATTERNS) {
    entries.push({
      id: `pattern:${p.id}`,
      kind: "pattern",
      name: p.name,
      keywords: p.keywords,
      render: () => ({
        format: "css",
        source: p.css,
        usage:
          "Pure CSS — no image and no request. The default ink is rgba(0,0,0,.08); rebuild with a different colour/scale via getPattern(id).build(color, size).",
      }),
    });
  }

  // Illustrations. Four kinds rather than one, because "I need something behind
  // the headline", "I need a picture next to this feature", "I need a squiggle
  // under this word" and "I need a no-items panel" are four different requests
  // and the model can filter on them.
  for (const b of BACKDROPS) {
    entries.push({
      id: `backdrop:${b.id}`,
      kind: "backdrop",
      name: b.name,
      keywords: b.keywords,
      render: () => ({
        format: "jsx",
        source: illustrationJsx(backdropSvg(b.id) ?? ""),
        usage:
          "Full-bleed hero/section background. Put it as the first child of a `relative overflow-hidden` section with" +
          ' className="pointer-events-none absolute inset-0", then the content after it. It draws in currentColor, so' +
          " tint it with a text-* class on the svg and it works on light and dark alike.",
        variants: {
          // A different seed is a different arrangement of the same idea —
          // three sections can share one backdrop without looking cloned.
          seeded: illustrationJsx(backdropSvg(b.id, { seed: `${b.id}-2` }) ?? ""),
          svg: backdropSvg(b.id) ?? "",
        },
      }),
    });
  }

  for (const s of SPOTS) {
    entries.push({
      id: `illustration:${s.id}`,
      kind: "illustration",
      name: s.name,
      keywords: s.keywords,
      render: () => ({
        format: "jsx",
        source: illustrationJsx(spotSvg(s.id) ?? ""),
        usage:
          "A 200px spot illustration for a feature, service or step. Stroke and accent are both currentColor, so set" +
          " the colour with a text-* class on it or its parent. Every spot in this set shares one stroke weight and one" +
          " ground line, so a row of them lines up.",
        variants: {
          plain: illustrationJsx(spotSvg(s.id, { accent: false }) ?? ""),
          svg: spotSvg(s.id) ?? "",
        },
      }),
    });
  }

  for (const m of MARKS) {
    entries.push({
      id: `mark:${m.id}`,
      kind: "mark",
      name: m.name,
      keywords: m.keywords,
      render: () => ({
        format: "jsx",
        source: illustrationJsx(markSvg(m.id) ?? ""),
        usage: m.usage,
        variants: { svg: markSvg(m.id) ?? "", viewBox: m.viewBox },
      }),
    });
  }

  for (const e of EMPTY_STATES) {
    entries.push({
      id: `empty-state:${e.id}`,
      kind: "empty-state",
      name: e.name,
      keywords: e.keywords,
      render: () => ({
        format: "jsx",
        source: illustrationJsx(emptyStateSvg(e.id) ?? ""),
        usage:
          `Centre this in the empty panel with a heading like "${e.caption}" and one action under it. Inherits` +
          " currentColor — text-slate-400 on light, text-slate-500 on dark, is the usual weight for an empty state.",
        variants: {
          caption: e.caption,
          plain: illustrationJsx(emptyStateSvg(e.id, { accent: false }) ?? ""),
          // Placeholder art is the one thing here that gets used as a real
          // image, so it also ships as a data URI. currentColor cannot resolve
          // inside one, hence the baked colour.
          dataUri: illustrationDataUri(emptyStateSvg(e.id, { color: "#94a3b8", accent: false }) ?? ""),
        },
      }),
    });
  }

  entries.push({
    id: "avatar:initials",
    kind: "avatar",
    name: "Initials avatar",
    keywords: [
      "avatar",
      "initials",
      "placeholder",
      "profile",
      "person",
      "team",
      "testimonial",
      "user",
      "photo",
      "headshot",
      "portrait",
      "staff",
    ],
    render: () => {
      const sample = "Ada Lovelace";
      const { from, to } = avatarColors(sample);
      return {
        format: "jsx",
        source: toJsx(initialsAvatarSvg(sample, { size: 64 })),
        usage:
          "Deterministic from the name: same person, same colour, every build. Generate per name with initialsAvatarSvg(name) — or use initialsAvatarCss(name) and render the initials as text. This is the honest stand-in for a headshot; the sandbox has no photography.",
        variants: { initials: initialsOf(sample), from, to },
      };
    },
  });

  return entries;
}

const CATALOG: Entry[] = buildCatalog();
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Query-side expansion only — these terms are added to what the *caller*
 * typed, never to an asset's own keywords, so a synonym can never outrank a
 * literal match. Covers the two things that actually break naive keyword
 * search here: business vocabulary ("plumber" -> wrench) and British spelling.
 */
const SYNONYMS: Record<string, string[]> = {
  // Demonyms. Flag keywords are derived from the country NAME, so "french"
  // matched "French Guiana", "French Polynesia" and "French Southern
  // Territories" exactly while missing France entirely — the search returned
  // three obscure territories and not the country anyone meant. Only forms
  // that differ from the country name need listing; "japan"/"japanese" style
  // pairs where the name is a prefix of the demonym already score.
  french: ["france"],
  german: ["germany"],
  spanish: ["spain"],
  dutch: ["netherlands", "holland"],
  swiss: ["switzerland"],
  greek: ["greece"],
  danish: ["denmark"],
  swedish: ["sweden"],
  norwegian: ["norway"],
  finnish: ["finland"],
  polish: ["poland"],
  turkish: ["turkey"],
  british: ["united", "kingdom", "britain"],
  english: ["united", "kingdom"],
  scottish: ["scotland"],
  irish: ["ireland"],
  welsh: ["wales"],
  american: ["united", "states"],
  canadian: ["canada"],
  mexican: ["mexico"],
  brazilian: ["brazil"],
  argentine: ["argentina"],
  argentinian: ["argentina"],
  chinese: ["china"],
  korean: ["korea"],
  indian: ["india"],
  australian: ["australia"],
  italian: ["italy"],
  portuguese: ["portugal"],
  belgian: ["belgium"],
  austrian: ["austria"],
  czech: ["czechia"],
  russian: ["russia"],
  ukrainian: ["ukraine"],
  // spelling
  colour: ["color"],
  color: ["colour"],
  centre: ["center"],
  favourite: ["favorite"],
  grey: ["gray", "graphite", "slate"],
  // contact
  telephone: ["phone", "call"],
  email: ["mail", "envelope"],
  address: ["map", "pin", "location"],
  hours: ["clock", "time"],
  booking: ["calendar", "ticket"],
  enquiry: ["mail", "message", "help"],
  // trades and services
  plumber: ["wrench", "droplet", "repair"],
  plumbing: ["wrench", "droplet"],
  electrician: ["zap", "wrench"],
  builder: ["hammer", "home"],
  construction: ["hammer", "building"],
  handyman: ["wrench", "hammer"],
  hairdresser: ["scissors", "salon"],
  barber: ["scissors"],
  salon: ["scissors", "lotus", "spa"],
  gym: ["dumbbell", "fitness"],
  fitness: ["dumbbell"],
  yoga: ["lotus", "spa"],
  massage: ["lotus", "spa"],
  vet: ["paw", "stethoscope"],
  veterinary: ["paw", "stethoscope"],
  groomer: ["paw", "scissors"],
  dentist: ["tooth"],
  doctor: ["stethoscope"],
  clinic: ["stethoscope", "tooth"],
  photographer: ["camera"],
  photography: ["camera", "image"],
  cleaner: ["spray", "droplet"],
  cleaning: ["spray"],
  gardener: ["leaf", "sprout", "tree"],
  landscaping: ["leaf", "tree", "mountain"],
  florist: ["sprout", "lotus", "leaf"],
  mechanic: ["car", "wrench"],
  garage: ["car", "wrench"],
  taxi: ["car"],
  removals: ["truck", "package"],
  estate: ["home", "key", "building"],
  realtor: ["home", "key"],
  letting: ["key", "home"],
  tutor: ["graduation", "book"],
  school: ["graduation", "book"],
  accountant: ["calculator", "chart", "briefcase", "receipt"],
  lawyer: ["briefcase", "shield", "building"],
  // food and drink
  restaurant: ["utensils", "chef", "bowl"],
  menu: ["utensils", "book", "list"],
  cafe: ["coffee", "cake"],
  coffeeshop: ["coffee"],
  bakery: ["bread", "cake", "chef"],
  pub: ["beer", "wine"],
  bar: ["cocktail", "wine", "beer"],
  takeaway: ["pizza", "bowl", "truck"],
  delivery: ["truck", "package", "bike"],
  vegan: ["salad", "leaf", "sprout"],
  // commerce
  shop: ["store", "shopping", "cart", "bag"],
  ecommerce: ["cart", "bag", "card"],
  checkout: ["cart", "card", "wallet"],
  payment: ["card", "wallet", "lock"],
  pricing: ["tag", "percent", "layers"],
  sale: ["percent", "tag"],
  shipping: ["truck", "package"],
  // social
  twitter: ["x"],
  insta: ["instagram"],
  fb: ["facebook"],
  socials: ["instagram", "facebook", "linkedin", "tiktok", "youtube", "social"],
  // ui / visual
  logo: ["sparkles", "star", "zap"],
  hero: ["gradient", "mesh", "background"],
  background: ["gradient", "mesh", "pattern", "texture"],
  wave: ["divider", "curve"],
  separator: ["divider"],
  headshot: ["avatar", "initials"],
  photo: ["image", "avatar", "camera"],
  testimonial: ["quote", "star", "avatar"],
  faq: ["chevron", "help", "plus"],
  rating: ["star"],
  reviews: ["star", "quote"],
  cta: ["arrow", "gradient"],
};

const STOPWORDS = new Set(["a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "icon", "icons"]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** How well one query token matches one asset. 0 means "not at all". */
function tokenScore(entry: Entry, token: string, isSynonym: boolean): number {
  const bare = entry.id.slice(entry.id.indexOf(":") + 1);
  let best = 0;
  if (bare === token) best = 16;
  else if (entry.name.toLowerCase() === token) best = 14;
  else {
    for (const kw of entry.keywords) {
      if (kw === token) best = Math.max(best, 10);
      else if (token.length >= 3 && kw.startsWith(token)) best = Math.max(best, 6);
      else if (token.length >= 4 && kw.includes(token)) best = Math.max(best, 3);
      if (best === 10) break;
    }
    if (best === 0 && token.length >= 4 && bare.includes(token)) best = 4;
  }
  // A synonym hit is real but weaker than the word the caller actually typed.
  return isSynonym ? best * 0.6 : best;
}

function kindFilter(kind: FindAssetsOptions["kind"]): Set<AssetKind> | null {
  if (!kind) return null;
  const list = Array.isArray(kind) ? kind : [kind];
  const valid = list.filter((k): k is AssetKind => ASSET_KINDS.includes(k));
  return valid.length > 0 ? new Set(valid) : null;
}

function toMatch(entry: Entry, score: number, opts: FindAssetsOptions): AssetMatch {
  const rendered = entry.render(opts);
  return { id: entry.id, kind: entry.kind, name: entry.name, keywords: entry.keywords, score, ...rendered };
}

/**
 * Keyword/synonym search across icons, flags, gradients, meshes, textures,
 * dividers, patterns and avatars.
 *
 * Multi-word queries are AND-ish: every token must contribute something, so
 * "coffee shop" prefers assets that speak to both rather than everything that
 * mentions "shop". An empty query lists the catalogue (filtered by `kind`).
 */
export function findAssets(query: string, opts: FindAssetsOptions = {}): AssetMatch[] {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const allowed = kindFilter(opts.kind);
  const pool = allowed ? CATALOG.filter((e) => allowed.has(e.kind)) : CATALOG;

  const tokens = tokenize(query);
  if (tokens.length === 0) return pool.slice(0, limit).map((e) => toMatch(e, 0, opts));

  const scored: { entry: Entry; score: number; matched: number }[] = [];
  for (const entry of pool) {
    let total = 0;
    let matched = 0;
    for (const token of tokens) {
      let best = tokenScore(entry, token, false);
      if (best === 0) {
        for (const syn of SYNONYMS[token] ?? []) {
          best = Math.max(best, tokenScore(entry, syn, true));
        }
      }
      if (best > 0) {
        matched++;
        total += best;
      }
    }
    // PREFER assets that match every token; do not REQUIRE it.
    //
    // This used to drop any entry that missed a single token, which made the
    // docstring above false and — worse — made its own example return nothing:
    // "coffee shop" found no coffee icon, because the coffee icon carries no
    // "shop" keyword and the AND threw it away. A search that returns an empty
    // list when a perfectly good match exists is the failure mode that sends
    // the model back to hand-writing SVG.
    //
    // Ranking by matched-token COUNT first preserves the intent: an asset that
    // speaks to both words still beats one that speaks to either.
    if (matched > 0) scored.push({ entry, score: total, matched });
  }

  scored.sort(
    (a, b) =>
      b.matched - a.matched ||
      b.score - a.score ||
      // Tie-break on the shorter NAME, not the id. Score ties are common
      // between a country and a territory that contains its demonym, and
      // alphabetical order resolved them by luck: it happened to favour France
      // over French Guiana, but favoured American Samoa over the United States.
      // The shorter name is the more canonical entity.
      a.entry.name.length - b.entry.name.length ||
      a.entry.id.localeCompare(b.entry.id),
  );
  return scored.slice(0, limit).map(({ entry, score }) => toMatch(entry, score, opts));
}

/** Look one asset up by its stable id, e.g. "icon:phone". */
export function getAsset(id: string, opts: FindAssetsOptions = {}): AssetMatch | null {
  const entry = BY_ID.get(id.trim());
  return entry ? toMatch(entry, 0, opts) : null;
}

/** Everything, optionally of one kind. Ordered as declared. */
export function listAssets(kind?: AssetKind, opts: FindAssetsOptions = {}): AssetMatch[] {
  const pool = kind ? CATALOG.filter((e) => e.kind === kind) : CATALOG;
  return pool.map((e) => toMatch(e, 0, opts));
}

/** Ids only — cheap enough to put in a prompt or a picker's index. */
export function listAssetIds(kind?: AssetKind): string[] {
  return (kind ? CATALOG.filter((e) => e.kind === kind) : CATALOG).map((e) => e.id);
}

export type AssetCatalogSummary = {
  total: number;
  byKind: { kind: AssetKind; count: number }[];
  iconCategories: { category: string; count: number }[];
  flags: { total: number; withSvg: number; emojiOnly: number };
};

/** A short description of what is in here — for a picker UI or a tool preamble. */
export function assetCatalogSummary(): AssetCatalogSummary {
  const byKind = ASSET_KINDS.map((kind) => ({ kind, count: CATALOG.filter((e) => e.kind === kind).length }));
  const withSvg = FLAGS.filter((f) => f.svg).length;
  return {
    total: CATALOG.length,
    byKind,
    iconCategories: iconCategories(),
    flags: { total: FLAGS.length, withSvg, emojiOnly: FLAGS.length - withSvg },
  };
}

export { ICONS, iconSvg, iconJsx, iconDataUri, getIcon, toJsx, ICON_WEIGHTS } from "./icons";
export { FLAGS, flagEmoji, flagSvg, flagDataUri, getFlag, flagsWithSvg } from "./flags";
export {
  GRADIENTS,
  MESHES,
  TEXTURES,
  DIVIDERS,
  PATTERNS,
  getGradient,
  getPattern,
  radialGradientCss,
  dividerSvg,
  noiseDataUri,
  initialsAvatarSvg,
  initialsAvatarCss,
  initialsOf,
  avatarColors,
} from "./patterns";
export {
  BACKDROPS,
  SPOTS,
  MARKS,
  EMPTY_STATES,
  backdropSvg,
  spotSvg,
  markSvg,
  emptyStateSvg,
  illustrationJsx,
  illustrationDataUri,
  getBackdrop,
  getSpot,
  getMark,
  getEmptyState,
} from "./illustrations";

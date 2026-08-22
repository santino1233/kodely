"use client";

import type { CSSProperties, ReactNode } from "react";
import { backdropSvg } from "@/lib/assets/illustrations";
import { getIcon } from "@/lib/assets/icons";
import { GRADIENTS, PATTERNS } from "@/lib/assets/patterns";
import { paletteFromPreset, readableInk, type BrandPalette } from "@/lib/brand-kit";

/**
 * A cover image for a template, when there is no image.
 *
 * THE PROBLEM
 * `lib/templates.ts` ships 23 prompts and nothing else: no thumbnail, no
 * preview, no starting HTML. Nothing in this product screenshots a site
 * (docs/design-system.md, "Thumbnails — nothing captures a screenshot"), and
 * the CSP blocks every remote host, so a stock photo or a hosted preview is
 * not a shortcut that is available — it is a lie that would 404.
 *
 * THE ANSWER — draw the SHAPE of the site, not a picture of it
 * Every cover here is a miniature, abstract wireframe of the page that
 * template actually builds, painted in that template's own palette. A
 * restaurant cover is a hero band over a two-column priced menu; a
 * photographer's is a masonry grid of mixed-aspect tiles; a tradesperson's is
 * one enormous call button. No fake words, no fake photographs, no rendered
 * screenshot — bars, tiles and rules, which is what a wireframe has always
 * been. It promises the customer a layout, and a layout is exactly what the
 * prompt behind it asks for.
 *
 * WHY THAT GIVES 23 DISTINGUISHABLE COVERS
 * Four independent axes, all sourced from `lib/assets`:
 *   1. LAYOUT   — 23 archetypes, one per template. Distinct before colour.
 *   2. PALETTE  — 23 different presets out of the 30 in GRADIENTS, run through
 *                 `paletteFromPreset()` so the mini-page gets the same
 *                 contrast-checked ink/surface pair the brand kit would give a
 *                 real build. Dark presets (ink, midnight, plum-night) produce
 *                 a dark mini-page, which is itself a signal.
 *   3. TEXTURE  — a PATTERNS preset over the gradient: barber stripes on the
 *                 barbershop, checkerboard on the food truck, ruled lines on
 *                 the blog, blueprint grid on the trades page.
 *   4. SUBJECT  — one ICONS glyph in the hero, all 23 different, and a
 *                 BACKDROPS generator seeded by the template id behind it.
 *
 * Deterministic by construction: the recipe is a literal, the backdrop seed is
 * the template id, and nothing here reads a clock or Math.random. A template
 * looks the same on every render, in every session, forever.
 *
 * ON RAW HEX
 * The design system bans raw hex for product chrome, and every pixel of chrome
 * around this component obeys that. The artwork inside it is catalogue DATA —
 * the same `GRADIENTS` hexes `components/wizard/LookPicker.tsx` already paints
 * its swatches with. Each cover is a self-contained painted tile that renders
 * identically in light and dark theme rather than inheriting either, and no
 * text is ever placed on it (the card's own heading carries the name), so
 * there is no contrast pairing to get wrong.
 */

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

type Archetype =
  | "menu"
  | "hours"
  | "timetable"
  | "pricelist"
  | "groupedlist"
  | "tiers"
  | "callout"
  | "packages"
  | "columns"
  | "checklist"
  | "editorial"
  | "worktiles"
  | "projectgrid"
  | "gallery"
  | "sleeve"
  | "reading"
  | "linkstack"
  | "producthero"
  | "productcard"
  | "teaser"
  | "invite"
  | "schedule"
  | "cause";

type CoverRecipe = {
  /** A GRADIENTS preset id — the whole palette is derived from it. */
  gradient: string;
  /** A PATTERNS preset id, laid over the gradient. */
  pattern: string;
  /**
   * Tile size in px for that pattern. The catalogue's own defaults are tuned
   * for a full-width section; a cover is roughly 150px wide in the grid, so
   * every one of them is set here at a thumbnail scale instead. Ignored by the
   * two patterns that are gradients rather than tiles (vignette, fade-bottom).
   */
  patternSize: number;
  /** A BACKDROPS generator id, seeded with the template id. */
  backdrop: string;
  /** The layout of the mini-page. One per template. */
  archetype: Archetype;
  /** An ICONS id — the subject signal in the hero. */
  icon: string;
};

const COVER_RECIPES: Record<string, CoverRecipe> = {
  // Food & drink
  restaurant: { gradient: "ember", pattern: "crosshatch", patternSize: 9, backdrop: "arcs", archetype: "menu", icon: "chef-hat" },
  // `butter` over the more obvious `terracotta`: the cafe card sits directly
  // beside the restaurant's ember in the gallery, and two warm oranges in a
  // row is the one adjacency where these covers stop telling each other apart.
  "coffee-shop": { gradient: "butter", pattern: "dots", patternSize: 12, backdrop: "rings", archetype: "hours", icon: "coffee" },
  "food-truck": { gradient: "citrus", pattern: "checkerboard", patternSize: 16, backdrop: "burst", archetype: "timetable", icon: "truck" },
  // Beauty & wellness
  barbershop: { gradient: "ink", pattern: "stripes", patternSize: 9, backdrop: "spotlight", archetype: "pricelist", icon: "scissors" },
  "hair-salon": { gradient: "blush", pattern: "dots-offset", patternSize: 16, backdrop: "blobs", archetype: "groupedlist", icon: "spray" },
  "gym-studio": { gradient: "neon", pattern: "stripes-wide", patternSize: 22, backdrop: "burst", archetype: "tiers", icon: "dumbbell" },
  // Local services
  tradesperson: { gradient: "ocean", pattern: "grid", patternSize: 14, backdrop: "topo", archetype: "callout", icon: "wrench" },
  "local-service": { gradient: "forest", pattern: "dots-dense", patternSize: 7, backdrop: "hills", archetype: "packages", icon: "leaf" },
  // Professional services
  "law-firm": { gradient: "deep-sea", pattern: "lines-horizontal", patternSize: 8, backdrop: "rings", archetype: "columns", icon: "shield" },
  accountancy: { gradient: "teal-fade", pattern: "grid", patternSize: 14, backdrop: "rings", archetype: "checklist", icon: "receipt" },
  consultant: { gradient: "graphite", pattern: "grid-large", patternSize: 30, backdrop: "spotlight", archetype: "editorial", icon: "target" },
  agency: { gradient: "magenta", pattern: "dots-offset", patternSize: 16, backdrop: "blobs", archetype: "worktiles", icon: "palette" },
  // Personal & creative
  "personal-portfolio": { gradient: "iris", pattern: "grid", patternSize: 14, backdrop: "orbit", archetype: "projectgrid", icon: "code" },
  photographer: { gradient: "stone", pattern: "vignette", patternSize: 0, backdrop: "waves", archetype: "gallery", icon: "camera" },
  "band-musician": { gradient: "plum-night", pattern: "crosshatch", patternSize: 9, backdrop: "burst", archetype: "sleeve", icon: "music" },
  "personal-blog": { gradient: "paper", pattern: "lines-horizontal", patternSize: 8, backdrop: "topo", archetype: "reading", icon: "book" },
  "link-in-bio": { gradient: "candy", pattern: "dots", patternSize: 12, backdrop: "confetti", archetype: "linkstack", icon: "link" },
  // Startup & product
  "saas-landing": { gradient: "aurora", pattern: "grid-large", patternSize: 30, backdrop: "orbit", archetype: "producthero", icon: "rocket" },
  "product-launch": { gradient: "midnight", pattern: "vignette", patternSize: 0, backdrop: "spotlight", archetype: "productcard", icon: "package" },
  "coming-soon": { gradient: "lagoon", pattern: "dots-dense", patternSize: 7, backdrop: "spotlight", archetype: "teaser", icon: "sparkles" },
  // Events & causes
  wedding: { gradient: "lavender", pattern: "dots-offset", patternSize: 16, backdrop: "rings", archetype: "invite", icon: "heart" },
  event: { gradient: "sunset", pattern: "stripes-wide", patternSize: 22, backdrop: "confetti", archetype: "schedule", icon: "ticket" },
  nonprofit: { gradient: "amber-glow", pattern: "dots", patternSize: 12, backdrop: "hills", archetype: "cause", icon: "users" },
};

/** A template id that is not in the table still gets a real cover, not a hole. */
const FALLBACK_RECIPE: CoverRecipe = {
  gradient: "slate-mist",
  pattern: "dots", patternSize: 12,
  backdrop: "blobs",
  archetype: "editorial",
  icon: "globe",
};

const FALLBACK_PALETTE: BrandPalette = {
  presetId: null,
  primary: "#334155",
  secondary: "#0f172a",
  accent: "#38bdf8",
  ink: "#0b1120",
  surface: "#ffffff",
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type Cover = {
  id: string;
  recipe: CoverRecipe;
  palette: BrandPalette;
  gradientCss: string;
  patternStyle: CSSProperties;
  /** Markup for the hero backdrop — injected, because it is a generated string. */
  backdrop: string;
  /** The readable ink for anything drawn ON the gradient. */
  heroInk: string;
};

/** `"background-image: x; background-size: y;"` -> a React style object. */
function cssToStyle(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    out[prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())] = value;
  }
  return out as unknown as CSSProperties;
}

// Covers never change, so they are built once per id and kept. 23 small objects.
const CACHE = new Map<string, Cover>();

function resolveCover(id: string): Cover {
  const hit = CACHE.get(id);
  if (hit) return hit;

  const recipe = COVER_RECIPES[id] ?? FALLBACK_RECIPE;
  const gradient = GRADIENTS.find((g) => g.id === recipe.gradient) ?? GRADIENTS[0];
  const palette = paletteFromPreset(gradient.id) ?? FALLBACK_PALETTE;
  const heroInk = readableInk(palette.primary);
  const pattern = PATTERNS.find((p) => p.id === recipe.pattern) ?? PATTERNS[0];
  // The texture has to read against the gradient it sits on, so its ink flips
  // with the gradient's luminance exactly as the hero's does.
  const patternColor = heroInk === "#ffffff" ? "rgba(255,255,255,.17)" : "rgba(0,0,0,.08)";

  const cover: Cover = {
    id,
    recipe,
    palette,
    gradientCss: gradient.css,
    patternStyle: cssToStyle(pattern.build(patternColor, recipe.patternSize)),
    backdrop: backdropSvg(recipe.backdrop, { colors: [heroInk], seed: id }) ?? "",
    heroInk,
  };
  CACHE.set(id, cover);
  return cover;
}

// ---------------------------------------------------------------------------
// Drawing primitives
//
// A tiny accumulator rather than 23 hand-keyed JSX trees: every archetype is a
// sequence of boxes, pills, circles and glyphs, and React only needs the keys
// to be stable, which an incrementing counter over a deterministic drawing
// order already is.
// ---------------------------------------------------------------------------

const W = 320;
const H = 180;
const CARD = { x: 22, y: 18, w: 276, r: 10 };
const PAD = 14;
/** Left edge of the mini-page's content column. */
const X0 = CARD.x + PAD;
/** Width of that column. */
const CW = CARD.w - PAD * 2;
/** Bottom of the hero band. */
const HERO_BOTTOM = CARD.y + 58;
/** Where body content starts. */
const Y0 = HERO_BOTTOM + 12;

class Draw {
  private els: ReactNode[] = [];
  private n = 0;

  constructor(private readonly c: Cover) {}

  private key(): string {
    return `d${this.n++}`;
  }

  get p(): BrandPalette {
    return this.c.palette;
  }

  box(x: number, y: number, w: number, h: number, fill: string, opacity = 1, rx = 2): this {
    this.els.push(
      <rect key={this.key()} x={x} y={y} width={w} height={h} rx={rx} fill={fill} opacity={opacity} />,
    );
    return this;
  }

  /** A text line. The bread and butter of a wireframe. */
  line(x: number, y: number, w: number, h = 4, opacity = 0.34): this {
    return this.box(x, y, w, h, this.p.ink, opacity, h / 2);
  }

  pill(x: number, y: number, w: number, h: number, fill: string, opacity = 1): this {
    return this.box(x, y, w, h, fill, opacity, h / 2);
  }

  circle(cx: number, cy: number, r: number, fill: string, opacity = 1): this {
    this.els.push(<circle key={this.key()} cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} />);
    return this;
  }

  ring(cx: number, cy: number, r: number, stroke: string, width = 1.5, opacity = 1): this {
    this.els.push(
      <circle
        key={this.key()}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        opacity={opacity}
      />,
    );
    return this;
  }

  stroke(d: string, stroke: string, width = 1.5, opacity = 1): this {
    this.els.push(
      <path
        key={this.key()}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />,
    );
    return this;
  }

  /** A hairline separator between rows. */
  rule(x: number, y: number, w: number, opacity = 0.12): this {
    return this.box(x, y, w, 1, this.p.ink, opacity, 0);
  }

  /** A catalogue icon, scaled onto the cover's canvas. */
  icon(id: string, x: number, y: number, size: number, color: string, opacity = 1): this {
    const glyph = getIcon(id);
    if (!glyph) return this;
    return this.raw(
      <g
        key={this.key()}
        transform={`translate(${x} ${y}) scale(${size / 24})`}
        fill="none"
        stroke={color}
        color={color}
        strokeWidth={(1.6 * 24) / size}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        dangerouslySetInnerHTML={{ __html: glyph.body }}
      />,
    );
  }

  /** A check tick, for anything that lists what is included. */
  tick(x: number, y: number, size: number, color: string, opacity = 1): this {
    const s = size / 10;
    return this.stroke(`M${x} ${y + 5 * s}l${3 * s} ${3 * s}L${x + 9 * s} ${y + s}`, color, 1.6, opacity);
  }

  raw(node: ReactNode): this {
    this.els.push(node);
    return this;
  }

  done(): ReactNode[] {
    return this.els;
  }
}

// ---------------------------------------------------------------------------
// Shared hero treatments
// ---------------------------------------------------------------------------

type HeroKind = "left" | "centered" | "split" | "big" | "none";

/**
 * The band at the top of the mini-page: the gradient, the seeded backdrop
 * geometry clipped to it, and a lockup of bars. Five shapes, because a
 * left-aligned name-plus-button hero and a centred invitation lockup are
 * genuinely different pages and the cover should say so.
 */
function hero(d: Draw, c: Cover, kind: HeroKind): void {
  if (kind === "none") {
    // No band, but the page still needs a top edge that is not just white:
    // a thin brand rule, the way a type-led site opens.
    d.box(CARD.x, CARD.y, CARD.w, 4, c.palette.primary, 1, 0);
    return;
  }

  const gid = `kcg-${c.id}`;
  const cid = `kcc-${c.id}`;
  const height = HERO_BOTTOM - CARD.y;

  d.raw(
    <g key={`hero-${c.id}`} clipPath={`url(#${cid})`}>
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={height} fill={`url(#${gid})`} />
      {c.backdrop !== "" && (
        <g opacity={0.85} dangerouslySetInnerHTML={{ __html: c.backdrop }} />
      )}
    </g>,
  );

  // The band's bottom edge, drawn rather than implied. On the palest presets
  // (butter, blush, lavender, paper) the gradient is within a few percent of
  // the white page below it and the hero would otherwise have no edge at all.
  d.box(CARD.x, HERO_BOTTOM - 1, CARD.w, 1, c.palette.ink, 0.16, 0);

  const ink = c.heroInk;
  if (kind === "left") {
    d.box(X0, CARD.y + 16, 96, 8, ink, 0.92, 4);
    d.box(X0, CARD.y + 30, 132, 4, ink, 0.55, 2);
    d.pill(X0, CARD.y + 40, 52, 12, ink, 0.9);
    d.icon(c.recipe.icon, CARD.x + CARD.w - 46, CARD.y + 14, 30, ink, 0.85);
  } else if (kind === "centered") {
    const mid = CARD.x + CARD.w / 2;
    d.icon(c.recipe.icon, mid - 11, CARD.y + 8, 22, ink, 0.85);
    d.box(mid - 54, CARD.y + 33, 108, 8, ink, 0.92, 4);
    d.box(mid - 34, CARD.y + 46, 68, 4, ink, 0.55, 2);
  } else if (kind === "split") {
    d.box(X0, CARD.y + 18, 88, 8, ink, 0.92, 4);
    d.box(X0, CARD.y + 32, 120, 4, ink, 0.55, 2);
    d.box(CARD.x + CARD.w - 76, CARD.y + 12, 62, 36, ink, 0.18, 6);
    d.icon(c.recipe.icon, CARD.x + CARD.w - 60, CARD.y + 18, 24, ink, 0.9);
  } else {
    // "big" — one enormous statement, for a page whose whole job is one line.
    d.box(X0, CARD.y + 14, 168, 11, ink, 0.92, 5);
    d.box(X0, CARD.y + 31, 118, 5, ink, 0.5, 2.5);
    d.icon(c.recipe.icon, CARD.x + CARD.w - 44, CARD.y + 16, 28, ink, 0.85);
  }
}

// ---------------------------------------------------------------------------
// The 23 archetypes
// ---------------------------------------------------------------------------

/** Restaurant — hero, then a two-column priced menu with leader dots. */
function menu(d: Draw, c: Cover): void {
  hero(d, c, "left");
  d.line(X0, Y0, 34, 4, 0.22);
  for (let col = 0; col < 2; col++) {
    const x = X0 + col * 128;
    for (let i = 0; i < 4; i++) {
      const y = Y0 + 14 + i * 16;
      d.line(x, y, 56, 5, 0.44);
      for (let dot = 0; dot < 4; dot++) d.circle(x + 62 + dot * 6, y + 2.5, 0.9, c.palette.ink, 0.2);
      d.line(x + 92, y, 16, 5, 0.3);
    }
  }
  d.rule(X0, Y0 + 82, CW);
  d.line(X0, Y0 + 88, 62, 4, 0.24);
  d.line(X0 + 150, Y0 + 88, 48, 4, 0.24);
}

/** Cafe — a short drinks list beside the opening hours, which is the point. */
function hours(d: Draw, c: Cover): void {
  hero(d, c, "split");
  for (let i = 0; i < 5; i++) {
    const y = Y0 + i * 15;
    d.line(X0, y, 52, 5, 0.42);
    d.line(X0 + 70, y, 14, 5, 0.28);
  }
  const px = X0 + 138;
  d.box(px, Y0 - 4, 110, 84, c.palette.primary, 0.13, 7);
  d.line(px + 12, Y0 + 6, 40, 5, 0.4);
  for (let i = 0; i < 4; i++) {
    const y = Y0 + 20 + i * 14;
    d.line(px + 12, y, 30, 4, 0.3);
    d.line(px + 62, y, 34, 4, 0.42);
  }
}

/** Food truck — the week's stops as a row of day columns. */
function timetable(d: Draw, c: Cover): void {
  hero(d, c, "left");
  for (let i = 0; i < 5; i++) {
    const x = X0 + i * 50;
    d.line(x, Y0, 20, 4, 0.28);
    d.box(x, Y0 + 8, 42, 30, c.palette.accent, 0.24, 4);
    d.icon("map-pin", x + 13, Y0 + 14, 16, c.palette.ink, 0.5);
    d.line(x, Y0 + 44, 36, 4, 0.34);
    d.line(x, Y0 + 52, 24, 4, 0.22);
  }
  d.rule(X0, Y0 + 66, CW);
  for (let i = 0; i < 3; i++) d.pill(X0 + i * 60, Y0 + 74, 50, 12, c.palette.primary, 0.2);
}

/** Barbershop — service, duration, price. Five rows and a rule between each. */
function pricelist(d: Draw, c: Cover): void {
  hero(d, c, "left");
  for (let i = 0; i < 5; i++) {
    const y = Y0 + i * 17;
    d.circle(X0 + 5, y + 4, 5, c.palette.accent, 0.55);
    d.line(X0 + 18, y, 74, 5, 0.44);
    d.line(X0 + 18, y + 8, 40, 3, 0.22);
    d.pill(X0 + CW - 34, y, 34, 11, c.palette.accent, 0.28);
    if (i < 4) d.rule(X0, y + 14, CW);
  }
}

/** Salon — the same idea grouped into named categories, which is how a price
    list for cut / colour / treatments is actually read. */
function groupedlist(d: Draw, c: Cover): void {
  hero(d, c, "left");
  for (let g = 0; g < 3; g++) {
    const y = Y0 + g * 32;
    d.pill(X0, y, 30, 6, c.palette.accent, 0.75);
    for (let i = 0; i < 2; i++) {
      const ry = y + 12 + i * 11;
      d.line(X0, ry, 92, 4, 0.4);
      d.line(X0 + CW - 22, ry, 22, 4, 0.28);
    }
    d.line(X0 + 150, y, 40, 6, 0.14);
  }
}

/** Gym — a week strip over three membership cards, middle one highlighted. */
function tiers(d: Draw, c: Cover): void {
  hero(d, c, "centered");
  for (let i = 0; i < 7; i++) {
    d.box(X0 + i * 36, Y0 - 4, 30, 12, c.palette.ink, i % 3 === 1 ? 0.26 : 0.11, 3);
  }
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * 84;
    const lift = i === 1 ? 4 : 0;
    d.box(x, Y0 + 16 - lift, 76, 60 + lift, i === 1 ? c.palette.accent : c.palette.ink, i === 1 ? 0.2 : 0.07, 6);
    d.line(x + 12, Y0 + 26 - lift, 34, 5, 0.4);
    d.line(x + 12, Y0 + 38 - lift, 22, 8, 0.55);
    for (let r = 0; r < 2; r++) d.line(x + 12, Y0 + 54 + r * 9 - lift, 48, 3, 0.24);
  }
}

/** Tradesperson — the phone number is the page, so it is the cover. */
function callout(d: Draw, c: Cover): void {
  hero(d, c, "big");
  d.pill(X0, Y0 - 6, CW, 30, c.palette.primary, 0.92);
  d.icon("phone", X0 + 74, Y0 + 2, 18, c.palette.surface, 0.95);
  d.box(X0 + 100, Y0 + 6, 74, 9, c.palette.surface, 0.95, 4);
  for (let i = 0; i < 3; i++) {
    const y = Y0 + 34 + i * 14;
    d.tick(X0, y, 10, c.palette.accent, 0.85);
    d.line(X0 + 16, y + 2, 130 - i * 18, 4, 0.36);
  }
  for (let i = 0; i < 4; i++) d.pill(X0 + i * 44, Y0 + 78, 38, 10, c.palette.ink, 0.12);
}

/** Local service — three packages and the questions people actually ask. */
function packages(d: Draw, c: Cover): void {
  hero(d, c, "left");
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * 84;
    d.box(x, Y0 - 4, 76, 54, c.palette.ink, 0.06, 6);
    d.pill(x + 10, Y0 + 4, 30, 6, c.palette.primary, 0.7);
    for (let r = 0; r < 3; r++) {
      d.tick(x + 10, Y0 + 18 + r * 11, 8, c.palette.accent, 0.8);
      d.line(x + 22, Y0 + 20 + r * 11, 42 - r * 8, 3, 0.28);
    }
  }
  for (let i = 0; i < 2; i++) {
    const y = Y0 + 60 + i * 16;
    d.line(X0, y, 150 - i * 30, 4, 0.32);
    d.stroke(`M${X0 + CW - 10} ${y}l4 4-4 4`, c.palette.ink, 1.4, 0.3);
    d.rule(X0, y + 10, CW);
  }
}

/** Law firm — a serif masthead between rules, then two justified columns. */
function columns(d: Draw, c: Cover): void {
  hero(d, c, "centered");
  const mid = CARD.x + CARD.w / 2;
  d.rule(mid - 40, Y0 - 6, 80, 0.3);
  for (let col = 0; col < 2; col++) {
    const x = X0 + col * 128;
    d.line(x, Y0 + 4, 48, 5, 0.45);
    for (let i = 0; i < 6; i++) {
      d.line(x, Y0 + 16 + i * 9, i === 5 ? 68 : 114, 3, 0.2);
    }
  }
  d.rule(X0, Y0 + 78, CW, 0.3);
  d.rule(X0, Y0 + 81, CW, 0.16);
  d.line(X0, Y0 + 88, 70, 4, 0.28);
}

/** Accountant — six checked services across two columns, then the one thing
    that page is really read for: how the fee works. */
function checklist(d: Draw, c: Cover): void {
  hero(d, c, "left");
  for (let i = 0; i < 6; i++) {
    const x = X0 + (i % 2) * 128;
    const y = Y0 + Math.floor(i / 2) * 17;
    d.ring(x + 5, y + 3, 5, c.palette.accent, 1.4, 0.6);
    d.tick(x + 2, y, 6.5, c.palette.accent, 0.9);
    d.line(x + 16, y + 1, 84 - (i % 3) * 12, 4, 0.36);
  }
  d.rule(X0, Y0 + 58, CW);
  d.box(X0, Y0 + 66, CW, 26, c.palette.primary, 0.12, 6);
  d.line(X0 + 12, Y0 + 72, 62, 5, 0.42);
  d.line(X0 + 12, Y0 + 82, 104, 3, 0.22);
  d.pill(X0 + CW - 64, Y0 + 73, 52, 12, c.palette.primary, 0.8);
}

/** Consultant — a point of view, set large. Type is the whole page. */
function editorial(d: Draw, c: Cover): void {
  hero(d, c, "none");
  d.pill(X0, CARD.y + 16, 44, 7, c.palette.primary, 0.8);
  d.icon(c.recipe.icon, CARD.x + CARD.w - 44, CARD.y + 14, 24, c.palette.primary, 0.7);
  d.line(X0, CARD.y + 32, 224, 10, 0.72);
  d.line(X0, CARD.y + 48, 196, 10, 0.72);
  d.line(X0, CARD.y + 64, 132, 10, 0.4);
  d.rule(X0, CARD.y + 88, CW);
  for (let i = 0; i < 3; i++) {
    const y = CARD.y + 98 + i * 20;
    d.box(X0, y, 3, 14, c.palette.accent, 0.7, 1.5);
    d.line(X0 + 12, y, 70, 5, 0.42);
    d.line(X0 + 12, y + 9, 150, 3, 0.2);
  }
}

/** Agency — colour-blocked case studies, deliberately asymmetric. */
function worktiles(d: Draw, c: Cover): void {
  hero(d, c, "left");
  d.box(X0, Y0 - 6, 148, 74, c.palette.primary, 0.9, 7);
  d.pill(X0 + 12, Y0 + 44, 46, 7, c.palette.surface, 0.85);
  d.pill(X0 + 12, Y0 + 56, 30, 5, c.palette.surface, 0.5);
  d.box(X0 + 158, Y0 - 6, 90, 34, c.palette.accent, 0.85, 7);
  d.pill(X0 + 168, Y0 + 16, 40, 6, c.palette.surface, 0.8);
  d.box(X0 + 158, Y0 + 34, 90, 34, c.palette.secondary, 0.85, 7);
  d.pill(X0 + 168, Y0 + 56, 52, 6, c.palette.surface, 0.8);
  d.line(X0, Y0 + 78, 96, 4, 0.26);
}

/** Portfolio — four equal project tiles and a row of skill chips. */
function projectgrid(d: Draw, c: Cover): void {
  hero(d, c, "split");
  const marks = ["monitor", "smartphone", "code", "layers"];
  for (let i = 0; i < 4; i++) {
    const x = X0 + (i % 2) * 128;
    const y = Y0 - 4 + Math.floor(i / 2) * 40;
    d.box(x, y, 120, 34, c.palette.ink, 0.07, 6);
    d.icon(marks[i], x + 9, y + 9, 16, c.palette.primary, 0.75);
    d.line(x + 32, y + 10, 52, 5, 0.4);
    d.line(x + 32, y + 20, 74, 3, 0.2);
  }
  for (let i = 0; i < 5; i++) d.pill(X0 + i * 42, Y0 + 82, 34, 9, c.palette.accent, 0.25);
}

/** Photographer — a real masonry grid of mixed aspect ratios, which is the
    one thing that template's prompt spends a whole paragraph on. */
function gallery(d: Draw, c: Cover): void {
  hero(d, c, "none");
  d.line(X0, CARD.y + 14, 74, 7, 0.6);
  d.line(X0 + CW - 84, CARD.y + 16, 60, 4, 0.24);
  d.icon(c.recipe.icon, X0 + CW - 18, CARD.y + 10, 18, c.palette.primary, 0.8);
  const cols = [
    [40, 26, 34],
    [30, 44, 26],
    [46, 22, 32],
    [26, 38, 36],
  ];
  const cw = 58;
  cols.forEach((heights, col) => {
    let y = CARD.y + 30;
    heights.forEach((h, row) => {
      const tone = (col + row) % 3;
      d.box(
        X0 + col * (cw + 4),
        y,
        cw,
        h,
        tone === 0 ? c.palette.primary : tone === 1 ? c.palette.ink : c.palette.accent,
        tone === 1 ? 0.12 : 0.3,
        4,
      );
      y += h + 4;
    });
  });
}

/** Band — a record sleeve and a tracklist. Not a business page. */
function sleeve(d: Draw, c: Cover): void {
  hero(d, c, "none");
  d.box(X0, CARD.y + 14, 88, 88, c.palette.accent, 0.9, 4);
  d.ring(X0 + 44, CARD.y + 58, 30, c.palette.surface, 2, 0.65);
  d.ring(X0 + 44, CARD.y + 58, 20, c.palette.surface, 1.2, 0.4);
  d.circle(X0 + 44, CARD.y + 58, 9, c.palette.surface, 0.9);
  d.circle(X0 + 44, CARD.y + 58, 2, c.palette.accent, 1);
  const tx = X0 + 102;
  d.icon(c.recipe.icon, X0 + CW - 20, CARD.y + 12, 20, c.palette.primary, 0.8);
  d.line(tx, CARD.y + 14, 96, 9, 0.75);
  d.line(tx, CARD.y + 29, 62, 4, 0.35);
  for (let i = 0; i < 4; i++) {
    const y = CARD.y + 44 + i * 13;
    d.line(tx, y, 12, 4, 0.22);
    d.line(tx + 18, y, 90 - i * 10, 4, 0.4);
  }
  // The streaming links — the row of buttons that prompt insists on, because
  // there is no player and never will be.
  for (let i = 0; i < 3; i++) d.pill(tx + i * 44, CARD.y + 94, 38, 11, c.palette.primary, 0.35);
}

/** Blog — one column, a comfortable measure, nothing else. */
function reading(d: Draw, c: Cover): void {
  hero(d, c, "none");
  const x = X0 + 34;
  const w = 174;
  d.line(x, CARD.y + 14, 60, 6, 0.55);
  d.icon(c.recipe.icon, x + w - 16, CARD.y + 10, 16, c.palette.primary, 0.75);
  d.rule(x, CARD.y + 26, w, 0.18);
  d.line(x, CARD.y + 34, 122, 8, 0.7);
  for (let i = 0; i < 5; i++) d.line(x, CARD.y + 48 + i * 8, i === 4 ? 96 : w, 3, 0.2);
  d.line(x, CARD.y + 94, 104, 7, 0.55);
  for (let i = 0; i < 5; i++) d.line(x, CARD.y + 106 + i * 8, i === 4 ? 132 : w, 3, 0.2);
}

/** Link in bio — one column of big tap targets on a phone. */
function linkstack(d: Draw, c: Cover): void {
  hero(d, c, "none");
  const mid = CARD.x + CARD.w / 2;
  d.circle(mid, CARD.y + 26, 13, c.palette.primary, 0.9);
  d.icon(c.recipe.icon, mid - 7, CARD.y + 19, 14, c.palette.surface, 0.95);
  d.line(mid - 30, CARD.y + 44, 60, 6, 0.6);
  d.line(mid - 44, CARD.y + 54, 88, 3, 0.24);
  for (let i = 0; i < 4; i++) {
    const y = CARD.y + 66 + i * 18;
    d.pill(X0 + 24, y, CW - 48, 14, c.palette.accent, i === 0 ? 0.6 : 0.3);
    d.circle(X0 + 36, y + 7, 3.5, c.palette.ink, 0.4);
    d.line(X0 + 46, y + 5, 60 - i * 6, 4, 0.36);
  }
  for (let i = 0; i < 4; i++) d.circle(mid - 24 + i * 16, CARD.y + 146, 4, c.palette.ink, 0.25);
}

/** SaaS — hero with two buttons, a three-step diagram, three price columns. */
function producthero(d: Draw, c: Cover): void {
  hero(d, c, "left");
  // The second hero button, which is the "Sign in" half of that prompt.
  d.raw(
    <rect
      key="saas-secondary"
      x={X0 + 58}
      y={CARD.y + 40}
      width={38}
      height={12}
      rx={6}
      fill="none"
      stroke={c.heroInk}
      strokeWidth={1.2}
      opacity={0.7}
    />,
  );
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * 84;
    d.box(x, Y0 - 6, 76, 32, c.palette.ink, 0.06, 6);
    if (i === 0) d.ring(x + 20, Y0 + 10, 9, c.palette.primary, 2, 0.8);
    if (i === 1) d.box(x + 12, Y0 + 2, 17, 17, c.palette.primary, 0.8, 3);
    if (i === 2) d.stroke(`M${x + 12} ${Y0 + 19}l9-17 9 17Z`, c.palette.primary, 2, 0.8);
    d.line(x + 38, Y0 + 6, 28, 4, 0.34);
    d.line(x + 38, Y0 + 14, 20, 3, 0.2);
  }
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * 84;
    const lift = i === 1 ? 5 : 0;
    d.box(x, Y0 + 36 - lift, 76, 44 + lift, i === 1 ? c.palette.primary : c.palette.ink, i === 1 ? 0.16 : 0.06, 6);
    d.line(x + 12, Y0 + 44 - lift, 26, 4, 0.3);
    d.line(x + 12, Y0 + 54 - lift, 34, 8, 0.5);
    d.pill(x + 12, Y0 + 68 - lift, 52, 8, c.palette.primary, i === 1 ? 0.85 : 0.3);
  }
}

/** Product launch — one object, its specs, and a buy link. */
function productcard(d: Draw, c: Cover): void {
  hero(d, c, "centered");
  d.box(X0 + 4, Y0 - 4, 100, 76, c.palette.ink, 0.07, 8);
  d.box(X0 + 22, Y0 + 8, 64, 52, c.palette.primary, 0.9, 5);
  d.box(X0 + 22, Y0 + 26, 64, 8, c.palette.accent, 0.9, 0);
  d.circle(X0 + 54, Y0 + 46, 6, c.palette.surface, 0.55);
  const sx = X0 + 122;
  for (let i = 0; i < 4; i++) {
    const y = Y0 + i * 14;
    d.line(sx, y, 38, 4, 0.24);
    d.line(sx + 50, y, 62 - i * 8, 4, 0.4);
    d.rule(sx, y + 9, 126, 0.1);
  }
  d.pill(sx, Y0 + 58, 100, 14, c.palette.accent, 0.85);
}

/** Coming soon — one screen, mostly air, one call to action. */
function teaser(d: Draw, c: Cover): void {
  hero(d, c, "none");
  const mid = CARD.x + CARD.w / 2;
  d.pill(mid - 34, CARD.y + 26, 68, 11, c.palette.accent, 0.35);
  d.icon(c.recipe.icon, mid - 9, CARD.y + 44, 18, c.palette.primary, 0.8);
  d.line(mid - 78, CARD.y + 70, 156, 12, 0.75);
  d.line(mid - 52, CARD.y + 88, 104, 12, 0.75);
  d.line(mid - 66, CARD.y + 108, 132, 4, 0.26);
  d.pill(mid - 42, CARD.y + 122, 84, 16, c.palette.primary, 0.9);
}

/** Wedding — a centred lockup and the day as a timeline. */
function invite(d: Draw, c: Cover): void {
  hero(d, c, "centered");
  const mid = CARD.x + CARD.w / 2;
  d.icon("leaf", mid - 66, Y0 - 8, 16, c.palette.primary, 0.5);
  d.raw(
    <g key="invite-leaf-mirror" transform={`translate(${mid + 66} ${Y0 - 8}) scale(-1 1)`}>
      <g
        fill="none"
        stroke={c.palette.primary}
        color={c.palette.primary}
        strokeWidth={1.6 * (24 / 16)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
        transform="scale(0.6667)"
        dangerouslySetInnerHTML={{ __html: getIcon("leaf")?.body ?? "" }}
      />
    </g>,
  );
  d.box(mid - 0.5, Y0 + 12, 1, 62, c.palette.ink, 0.14, 0);
  for (let i = 0; i < 4; i++) {
    const y = Y0 + 18 + i * 16;
    d.circle(mid, y, 3.5, c.palette.primary, 0.85);
    const left = i % 2 === 0;
    d.line(left ? mid - 76 : mid + 12, y - 2, 64, 4, 0.34);
    d.line(left ? mid - 46 : mid + 12, y + 5, 34, 3, 0.18);
  }
}

/** Event — a programme with a time gutter, and speakers as initials. */
function schedule(d: Draw, c: Cover): void {
  hero(d, c, "left");
  d.box(X0 + 26, Y0 - 4, 1, 62, c.palette.ink, 0.14, 0);
  for (let i = 0; i < 4; i++) {
    const y = Y0 + i * 16;
    d.line(X0, y, 20, 4, 0.28);
    d.circle(X0 + 26, y + 2, 3, c.palette.accent, 0.8);
    d.line(X0 + 36, y - 1, 128 - i * 14, 5, 0.4);
    d.line(X0 + 36, y + 7, 54, 3, 0.2);
  }
  d.rule(X0, Y0 + 66, CW);
  for (let i = 0; i < 4; i++) {
    d.circle(X0 + 12 + i * 34, Y0 + 82, 11, c.palette.primary, 0.22 + i * 0.14);
    d.line(X0 + i * 34, Y0 + 96, 24, 3, 0.2);
  }
  d.pill(X0 + CW - 58, Y0 + 74, 58, 14, c.palette.accent, 0.8);
}

/** Nonprofit — two doors on the page: give, or get help. */
function cause(d: Draw, c: Cover): void {
  hero(d, c, "split");
  d.pill(X0, Y0 - 6, 108, 18, c.palette.primary, 0.9);
  d.raw(
    <rect
      key="cause-secondary"
      x={X0 + 120}
      y={Y0 - 6}
      width={108}
      height={18}
      rx={9}
      fill="none"
      stroke={c.palette.ink}
      strokeWidth={1.4}
      opacity={0.35}
    />,
  );
  d.box(X0, Y0 + 20, CW, 30, c.palette.accent, 0.16, 6);
  d.icon("phone", X0 + 12, Y0 + 28, 16, c.palette.ink, 0.55);
  d.line(X0 + 36, Y0 + 27, 96, 5, 0.42);
  d.line(X0 + 36, Y0 + 36, 140, 3, 0.24);
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * 84;
    d.box(x, Y0 + 58, 76, 26, c.palette.ink, 0.06, 5);
    d.line(x + 10, Y0 + 64, 40, 4, 0.34);
    d.line(x + 10, Y0 + 73, 56, 3, 0.18);
  }
}

const ARCHETYPES: Record<Archetype, (d: Draw, c: Cover) => void> = {
  menu,
  hours,
  timetable,
  pricelist,
  groupedlist,
  tiers,
  callout,
  packages,
  columns,
  checklist,
  editorial,
  worktiles,
  projectgrid,
  gallery,
  sleeve,
  reading,
  linkstack,
  producthero,
  productcard,
  teaser,
  invite,
  schedule,
  cause,
};

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

/**
 * Decorative by design: `aria-hidden`, because the card's own heading and
 * description already say which template this is, and reading out a wireframe
 * would be noise rather than information.
 */
export function TemplateCover({
  templateId,
  className = "",
}: {
  templateId: string;
  className?: string;
}) {
  const cover = resolveCover(templateId);
  const draw = new Draw(cover);
  ARCHETYPES[cover.recipe.archetype](draw, cover);
  const gid = `kcg-${cover.id}`;
  const cid = `kcc-${cover.id}`;
  const { primary, secondary, surface, ink } = cover.palette;

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundImage: cover.gradientCss }}
    >
      <div className="absolute inset-0" style={cover.patternStyle} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="relative block h-full w-full"
        focusable="false"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor={secondary} />
          </linearGradient>
          <clipPath id={cid}>
            <rect
              x={CARD.x}
              y={CARD.y}
              width={CARD.w}
              height={HERO_BOTTOM - CARD.y}
              rx={CARD.r}
            />
          </clipPath>
        </defs>

        {/* A soft drop under the card. Without it the palest presets (butter,
            blush, lavender, paper) put a white page on an almost-white
            gradient and the mini-page loses its edge entirely. */}
        <rect
          x={CARD.x + 3}
          y={CARD.y + 4}
          width={CARD.w}
          height={H - CARD.y}
          rx={CARD.r}
          fill={ink}
          opacity={0.1}
        />

        {/* The mini-page itself. It runs off the bottom edge on purpose: a
            website does not end where the thumbnail does. */}
        <rect
          x={CARD.x}
          y={CARD.y}
          width={CARD.w}
          height={H - CARD.y + CARD.r}
          rx={CARD.r}
          fill={surface}
        />
        {draw.done()}
        <rect
          x={CARD.x + 0.5}
          y={CARD.y + 0.5}
          width={CARD.w - 1}
          height={H - CARD.y}
          rx={CARD.r}
          fill="none"
          stroke={ink}
          strokeWidth={1}
          opacity={0.12}
        />
      </svg>
    </div>
  );
}

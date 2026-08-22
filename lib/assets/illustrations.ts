/**
 * Illustrations and procedural imagery — hero backdrops, spot illustrations,
 * decorative marks and empty-state art.
 *
 * WHY THIS CATEGORY, AND WHY IT LOOKS LIKE THIS
 * Generated sites run under `default-src 'self'; img-src 'self' data:;
 * connect-src 'none'` with no external hosts and no way to add packages, so
 * stock photography is not "unbuilt", it is impossible: there is nowhere to
 * fetch it from, and a base64 raster is worse than useless because it passes
 * through the model's context as tokens (a 200 KB PNG is ~89k tokens — more
 * than the rest of a four-turn build put together). What a browser will always
 * draw for free is geometry, so that is the only currency this module trades
 * in. Everything here is either arithmetic evaluated at render time or a short
 * hand-authored path on a fixed grid.
 *
 * PROVENANCE
 * Every coordinate in this file is original work: primitives (lines, arcs,
 * rounded rectangles, circles) placed by hand on a 120-unit grid, plus paths
 * computed by the generators below from sine terms and a seeded PRNG. No path
 * data, no shape, and no parameter set was copied, traced or adapted from any
 * icon set, illustration pack, CSS library or template, free or licensed.
 * These assets are inlined into customers' commercial sites, so anything with
 * a licence attached would become their problem; nothing here has one.
 *
 * THE FAMILY RULES — what makes forty pieces look like one set
 *   1. One pen. Everything is a `currentColor` stroke of width 4 on a
 *      120-unit-tall canvas, `stroke-linecap`/`stroke-linejoin` round. Nothing
 *      is drawn at a second weight, and no corner radius is drawn by hand —
 *      the round join IS the corner radius.
 *   2. One accent. Where a piece needs mass rather than line, it gets exactly
 *      one soft shape behind it, filled with `currentColor` at 13% — the same
 *      blob, from the same generator that draws the hero backdrops.
 *   3. No literal colour. Nothing here names a hex value unless the caller
 *      passes one, so every piece inherits the site's brand colour from its
 *      parent's `color` and reads correctly on light and dark alike.
 *   4. One vocabulary. Objects sit on a common ground line at y=100, rectangles
 *      round at r=4..6, and every curve is a circular arc or a cubic — no
 *      textures, no gradients, no shadows.
 */

// ---------------------------------------------------------------------------
// Deterministic randomness. Same seed, same picture, on every rebuild — a hero
// that reshuffles itself between deploys is a bug, not a feature.
// ---------------------------------------------------------------------------

/** FNV-1a, the same hash patterns.ts uses for avatar colours. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — 32 bits of state, uniform enough to place shapes with. */
function rng(seed: string): () => number {
  let a = hash32(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One decimal place. Path data is bytes, and the second decimal is invisible. */
function n(v: number): string {
  return String(Math.round(v * 10) / 10);
}

// ---------------------------------------------------------------------------
// Curve helpers — the geometric vocabulary the whole module is built from.
// ---------------------------------------------------------------------------

type Pt = [number, number];

/**
 * A closed Catmull-Rom spline through `pts`, emitted as cubics. This is the
 * single primitive behind every organic shape here: blobs, contours, hills and
 * the accent behind each spot illustration all come out of it, which is why
 * they look related rather than merely adjacent.
 */
function closedSpline(pts: Pt[]): string {
  const len = pts.length;
  const at = (i: number): Pt => pts[((i % len) + len) % len];
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < len; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d +=
      `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d}Z`;
}

/**
 * A closed organic blob: a circle whose radius is modulated by two sine terms.
 * `wobble` 0 gives a plain ellipse; 0.05-0.2 is the band that still reads as a
 * deliberate shape rather than a splat.
 */
function blobPath(cx: number, cy: number, r: number, phase: number, wobble = 0.11, squash = 1, points = 8): string {
  const pts: Pt[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(3 * a + phase) + wobble * 0.55 * Math.sin(5 * a - phase));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  return closedSpline(pts);
}

// ---------------------------------------------------------------------------
// Shared render plumbing
// ---------------------------------------------------------------------------

/**
 * JSX attribute spelling. icons.ts owns the list for the attributes IT emits;
 * illustrations additionally use dash arrays and opacity pairs, so the list is
 * extended here rather than by editing that module.
 */
const JSX_ATTRS: [RegExp, string][] = [
  [/\bstroke-width=/g, "strokeWidth="],
  [/\bstroke-linecap=/g, "strokeLinecap="],
  [/\bstroke-linejoin=/g, "strokeLinejoin="],
  [/\bstroke-dasharray=/g, "strokeDasharray="],
  [/\bstroke-opacity=/g, "strokeOpacity="],
  [/\bfill-opacity=/g, "fillOpacity="],
  [/\bfill-rule=/g, "fillRule="],
  [/\bstop-color=/g, "stopColor="],
  [/\bstop-opacity=/g, "stopOpacity="],
  [/\bclass=/g, "className="],
];

/** The same markup with JSX-safe attribute names — ready for a .tsx file. */
export function illustrationJsx(svg: string): string {
  return JSX_ATTRS.reduce((acc, [re, to]) => acc.replace(re, to), svg);
}

/**
 * `data:` URI form for CSS `background-image` / `<img src>`. Allowed by the
 * sandbox CSP (`img-src 'self' data:`). `currentColor` does NOT resolve inside
 * a data URI, so pass an explicit `color` when using this form.
 */
export function illustrationDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

function attr(name: string, value: string | number | undefined | null): string {
  return value === undefined || value === null || value === "" ? "" : ` ${name}="${value}"`;
}

function label(title: string | undefined): string {
  return title ? ` role="img" aria-label="${title.replace(/[<>&"]/g, "")}"` : ` aria-hidden="true"`;
}

// ---------------------------------------------------------------------------
// 1. HERO BACKDROPS
//
// Parameterised generators, not drawings. Each one takes a seed and produces a
// different arrangement of the same idea, so ten entries cover the "large empty
// area behind a headline" problem for any number of sites without any two of
// them looking identical. Drawn on a 1200x600 canvas and sliced to fit, which
// is what lets one shape work from a phone to an ultrawide.
// ---------------------------------------------------------------------------

export const BACKDROP_VIEWBOX = "0 0 1200 600";

/** Paint for one layer: `fill`/`stroke` plus an opacity, from the caller's palette. */
type Ink = (layer: number, opacity: number, stroked?: boolean) => string;

type BackdropDef = {
  id: string;
  name: string;
  /** Space-separated extra search terms; the id's own words are added. */
  k: string;
  build: (rand: () => number, ink: Ink, uid: string) => string;
};

const BACKDROP_DEFS: BackdropDef[] = [
  {
    id: "blobs",
    name: "Layered blobs",
    k: "organic soft rounded shapes blob abstract modern friendly startup",
    build: (r, ink) => {
      let s = "";
      for (let i = 0; i < 4; i++) {
        const cx = 140 + r() * 940;
        const cy = 60 + r() * 470;
        s += `<path d="${blobPath(cx, cy, 150 + r() * 200, r() * 6.28, 0.13, 0.85)}"${ink(i, 0.17 - i * 0.03)}/>`;
      }
      return s;
    },
  },
  {
    id: "rings",
    name: "Concentric rings",
    k: "circles concentric target ripple minimal geometric calm",
    build: (r, ink) => {
      const cx = 180 + r() * 840;
      const cy = 80 + r() * 440;
      let s = "";
      for (let i = 0; i < 7; i++) {
        s +=
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(70 + i * 68)}"${ink(i, 0.2 - i * 0.02, true)}` +
          ` stroke-width="${n(3 + r() * 5)}"/>`;
      }
      return s;
    },
  },
  {
    id: "arcs",
    name: "Corner arcs",
    k: "arc quarter rainbow sweep corner geometric editorial",
    build: (r, ink) => {
      const flip = r() > 0.5;
      const ox = flip ? 1200 : 0;
      const sweep = flip ? 0 : 1;
      let s = "";
      for (let i = 0; i < 6; i++) {
        const rad = 150 + i * 115;
        s +=
          `<path d="M${n(ox)} ${n(600 - rad)}A${n(rad)} ${n(rad)} 0 0 ${sweep} ${n(flip ? ox - rad : rad)} 600"` +
          `${ink(i, 0.19 - i * 0.024, true)} stroke-width="${n(6 + r() * 16)}"/>`;
      }
      return s;
    },
  },
  {
    id: "waves",
    name: "Wave bands",
    k: "wave water flow curves layered sea calm hero footer",
    build: (r, ink) => {
      let s = "";
      for (let i = 0; i < 4; i++) {
        const y = 210 + i * 85 + r() * 40;
        const amp = 40 + r() * 55;
        s +=
          `<path d="M0 ${n(y)}q150 ${n(-amp)} 300 0t300 0t300 0t300 0V600H0Z"` +
          `${ink(i, 0.13 - i * 0.018)}/>`;
      }
      return s;
    },
  },
  {
    id: "burst",
    name: "Ray burst",
    k: "rays sunburst radial energy retro spotlight dynamic",
    build: (r, ink) => {
      const cx = 300 + r() * 600;
      const cy = 640;
      const spokes = 13;
      const skew = r() * 0.3;
      let s = "";
      for (let i = 0; i < spokes; i++) {
        const a0 = Math.PI + (i / spokes) * Math.PI + skew;
        const a1 = a0 + (Math.PI / spokes) * 0.62;
        s +=
          `<path d="M${n(cx)} ${cy}L${n(cx + Math.cos(a0) * 1500)} ${n(cy + Math.sin(a0) * 1500)}` +
          `L${n(cx + Math.cos(a1) * 1500)} ${n(cy + Math.sin(a1) * 1500)}Z"${ink(i, 0.09)}/>`;
      }
      return s;
    },
  },
  {
    id: "topo",
    name: "Contour lines",
    k: "topographic contour map lines outdoors nature elevation hiking",
    build: (r, ink) => {
      const cx = 200 + r() * 800;
      const cy = 100 + r() * 400;
      const phase = r() * 6.28;
      let s = "";
      // Ten sample points, not eight: the extra pair is what stops a contour
      // reading as a plain ring, and it is the whole point of this backdrop.
      for (let i = 0; i < 6; i++) {
        s +=
          `<path d="${blobPath(cx, cy, 80 + i * 88, phase, 0.11, 0.9, 10)}"` +
          `${ink(i, 0.2 - i * 0.022, true)} stroke-width="3"/>`;
      }
      return s;
    },
  },
  {
    id: "confetti",
    name: "Confetti scatter",
    k: "scatter shapes playful party celebration kids events fun dots",
    build: (r, ink) => {
      let s = "";
      for (let i = 0; i < 16; i++) {
        const x = 40 + r() * 1120;
        const y = 40 + r() * 520;
        const size = 10 + r() * 26;
        const kind = Math.floor(r() * 3);
        const o = 0.13 + r() * 0.14;
        if (kind === 0) s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size / 2)}"${ink(i, o)}/>`;
        else if (kind === 1)
          s +=
            `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" rx="${n(size / 4)}"` +
            ` transform="rotate(${n(r() * 90)} ${n(x)} ${n(y)})"${ink(i, o)}/>`;
        else
          s +=
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size / 1.6)}"${ink(i, o, true)} stroke-width="${n(3 + r() * 3)}"/>`;
      }
      return s;
    },
  },
  {
    id: "orbit",
    name: "Orbits",
    k: "ellipse orbit atom tech saas ai network science rotation",
    build: (r, ink) => {
      const tilt = -40 + r() * 60;
      let s = "";
      for (let i = 0; i < 4; i++) {
        s +=
          `<ellipse cx="600" cy="300" rx="${n(280 + i * 120)}" ry="${n(110 + i * 46)}"` +
          ` transform="rotate(${n(tilt + i * 22)} 600 300)"${ink(i, 0.18 - i * 0.025, true)} stroke-width="3"/>`;
      }
      for (let i = 0; i < 3; i++) {
        const a = r() * 6.28;
        const rad = 280 + i * 120;
        s += `<circle cx="${n(600 + Math.cos(a) * rad)}" cy="${n(300 + Math.sin(a) * (110 + i * 46))}" r="${n(
          8 + r() * 10,
        )}"${ink(i, 0.28)}/>`;
      }
      return s;
    },
  },
  {
    id: "hills",
    name: "Rolling hills",
    k: "landscape hills mountains outdoors garden countryside layered ground",
    build: (r, ink) => {
      let s = "";
      for (let i = 0; i < 4; i++) {
        const y = 250 + i * 78;
        const a = 50 + r() * 70;
        const b = 40 + r() * 80;
        s +=
          `<path d="M0 ${n(y)}c200 ${n(-a)} 400 ${n(b)} 600 0s400 ${n(-b - 20)} 600 ${n(-a / 2)}V600H0Z"` +
          `${ink(i, 0.16 - i * 0.02)}/>`;
      }
      return s;
    },
  },
  {
    id: "spotlight",
    name: "Spotlight glow",
    k: "glow radial light dark hero saas dramatic vignette centre",
    build: (r, ink, uid) => {
      const cx = 300 + r() * 600;
      const cy = 40 + r() * 240;
      return (
        `<defs><radialGradient id="${uid}">` +
        `<stop offset="0%" stop-color="currentColor" stop-opacity=".38"/>` +
        `<stop offset="100%" stop-color="currentColor" stop-opacity="0"/>` +
        `</radialGradient></defs>` +
        `<rect width="1200" height="600" fill="url(#${uid})"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="420" ry="300"${ink(0, 0.12)}/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="250"${ink(1, 0.14, true)} stroke-width="3"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="390"${ink(2, 0.1, true)} stroke-width="3"/>`
      );
    },
  },
];

export type BackdropPreset = { id: string; name: string; keywords: string[] };

export const BACKDROPS: BackdropPreset[] = BACKDROP_DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  keywords: Array.from(
    new Set([...d.id.split("-"), ...d.k.split(" "), "hero", "background", "backdrop", "banner", "section", "abstract"]),
  ),
}));

const BACKDROP_BY_ID = new Map(BACKDROP_DEFS.map((d) => [d.id, d]));

export type BackdropOptions = {
  /** Change this to get a different arrangement of the same idea. Default: the id. */
  seed?: string;
  /**
   * Palette, cycled per layer. Omit for `currentColor`, which is the default
   * for a reason: the backdrop then tints itself from the section's text colour
   * and works on light and dark without a second variant.
   */
  colors?: string[];
  className?: string;
  title?: string;
};

/**
 * A full-bleed `<svg>` hero backdrop. Absolutely position it inside a
 * `relative overflow-hidden` section, behind the content.
 */
export function backdropSvg(id: string, opts: BackdropOptions = {}): string | null {
  const def = BACKDROP_BY_ID.get(id);
  if (!def) return null;
  const seed = opts.seed ?? id;
  const palette = opts.colors?.length ? opts.colors : ["currentColor"];
  const ink: Ink = (layer, opacity, stroked) => {
    const c = palette[layer % palette.length];
    return stroked ? ` fill="none" stroke="${c}" opacity="${opacity}"` : ` fill="${c}" opacity="${opacity}"`;
  };
  // Gradient ids are document-global, so two backdrops on one page would
  // collide on a fixed id. Derived from the seed, so it is still deterministic.
  const uid = `kb${hash32(`${id}${seed}`).toString(36)}`;
  const cls = `${opts.className ? `${opts.className} ` : ""}h-full w-full`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BACKDROP_VIEWBOX}" preserveAspectRatio="xMidYMid slice"` +
    ` width="100%" height="100%"${label(opts.title)} class="${cls}">${def.build(rng(seed), ink, uid)}</svg>`
  );
}

// ---------------------------------------------------------------------------
// 2. SPOT ILLUSTRATIONS
//
// The 200px-square drawing that goes next to a feature, a service or a step.
// All stroke, one weight, one accent blob behind — see THE FAMILY RULES above.
// ---------------------------------------------------------------------------

export const SPOT_VIEWBOX = "0 0 120 120";
export const SPOT_STROKE = 4;

/**
 * The soft shape behind every spot. Generated once from the same blob function
 * that draws the hero backdrops, which is the thread tying the two families
 * together. Fixed phase, so it is the same shape on every piece.
 */
const SPOT_ACCENT = blobPath(60, 56, 44, 0.9, 0.1, 0.95);
const WIDE_ACCENT = blobPath(80, 58, 52, 0.9, 0.1, 0.82);

type SpotDef = { id: string; name: string; k: string; body: string };

// Ground line shared by everything that stands on something. Same y on every
// piece, so a row of spots lines up.
const GROUND = (x1: number, x2: number) => `<path d="M${x1} 100H${x2}"/>`;
// A zero-length subpath with a round cap renders as a dot of stroke-width
// diameter — a filled dot that still inherits the stroke colour, for free.
const DOT = (x: number, y: number) => `M${x} ${y}h.01`;

const SPOT_DEFS: SpotDef[] = [
  {
    id: "storefront",
    name: "Storefront",
    k: "shop store retail high street business premises boutique front awning local",
    body:
      `<path d="M16 46 28 30h64l12 16Z"/>` +
      `<path d="M24 46v54h72V46"/>` +
      `<path d="M50 100V72h20v28"/>` +
      `<rect x="32" y="58" width="14" height="12" rx="2"/>` +
      `<rect x="78" y="58" width="14" height="12" rx="2"/>` +
      GROUND(10, 110),
  },
  {
    id: "cup",
    name: "Coffee cup",
    k: "coffee tea cafe drink hot beverage mug espresso barista break",
    body:
      `<path d="M38 50h44l-5 41a8 8 0 0 1-8 7H51a8 8 0 0 1-8-7Z"/>` +
      `<path d="M82 60h6a11 11 0 0 1 0 22h-4"/>` +
      `<path d="M52 24c5 6-5 10 0 16M68 24c5 6-5 10 0 16"/>` +
      `<path d="M28 102h64"/>`,
  },
  {
    id: "plant",
    name: "Potted plant",
    k: "plant pot leaf green garden nature growth eco florist indoor houseplant",
    body:
      `<path d="M40 76h40l-6 24H46Z"/>` +
      `<rect x="36" y="68" width="48" height="8" rx="3"/>` +
      `<path d="M60 68V38"/>` +
      `<path d="M60 54C46 54 38 46 36 34c14-1 24 6 24 20Z"/>` +
      `<path d="M60 46c14 0 22-8 24-20-14-1-24 6-24 20Z"/>` +
      GROUND(18, 102),
  },
  {
    id: "parcel",
    name: "Parcel",
    k: "box package delivery shipping post order courier fulfilment cardboard",
    body:
      // Isometric, not a flat rectangle: a face-on box with a lid line and a
      // tape stripe reads as a window pane at 200px. This is the closed twin of
      // the open box in the "no items" empty state.
      `<path d="M24 50 60 34l36 16-36 16Z"/>` +
      `<path d="M24 50v34l36 16V66"/>` +
      `<path d="M96 50v34l-36 16"/>` +
      `<path d="M42 42 78 58v25"/>` +
      GROUND(14, 106),
  },
  {
    id: "calendar-spot",
    name: "Calendar",
    k: "calendar date booking appointment schedule diary month event reserve",
    body:
      `<rect x="24" y="32" width="72" height="66" rx="6"/>` +
      `<path d="M24 52h72M42 24v16M78 24v16"/>` +
      `<path d="M36 66h10M55 66h10M74 66h10M36 82h10M55 82h10"/>`,
  },
  {
    id: "marker",
    name: "Location marker",
    k: "map pin location address directions find us where place travel",
    body:
      `<path d="M60 102s26-24 26-44a26 26 0 1 0-52 0c0 20 26 44 26 44Z"/>` +
      `<circle cx="60" cy="57" r="9"/>` +
      `<path d="M18 110h84" stroke-dasharray="1 11"/>`,
  },
  {
    id: "document",
    name: "Document",
    k: "document paper file page report invoice contract terms policy blog article",
    body:
      `<path d="M34 16h36l20 20v60a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4Z"/>` +
      `<path d="M70 16v20h20"/>` +
      `<path d="M46 54h32M46 68h32M46 82h18"/>`,
  },
  {
    id: "chat",
    name: "Chat bubble",
    k: "chat message bubble talk support enquiry comment review conversation contact",
    body:
      `<path d="M28 26h64a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H58L38 98V80H28a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10Z"/>` +
      `<path d="${DOT(44, 53)}${DOT(60, 53)}${DOT(76, 53)}"/>`,
  },
  {
    id: "bag",
    name: "Shopping bag",
    k: "bag shopping shop buy purchase ecommerce checkout retail cart tote",
    body:
      `<path d="M30 44h60l6 56H24Z"/>` +
      `<path d="M46 44v-8a14 14 0 0 1 28 0v8"/>` +
      GROUND(14, 106),
  },
  {
    id: "house",
    name: "House",
    k: "house home property estate agent building rent mortgage cottage roof",
    body:
      `<path d="M16 62 60 28l44 34"/>` +
      `<path d="M28 58v42h64V58"/>` +
      `<path d="M48 100V72h24v28"/>` +
      `<circle cx="60" cy="47" r="6"/>` +
      GROUND(10, 110),
  },
  {
    id: "truck",
    name: "Delivery truck",
    k: "truck van delivery transport logistics courier removals shipping fleet",
    body:
      `<rect x="12" y="50" width="56" height="38" rx="4"/>` +
      `<path d="M68 60h16l12 14v14H68Z"/>` +
      `<circle cx="34" cy="94" r="8"/>` +
      `<circle cx="84" cy="94" r="8"/>` +
      `<path d="M8 102h112"/>`,
  },
  {
    id: "toolbox",
    name: "Toolbox",
    k: "tools toolbox trade services repair maintenance handyman plumber builder kit",
    body:
      `<rect x="20" y="54" width="80" height="46" rx="6"/>` +
      `<path d="M20 70h80"/>` +
      `<path d="M48 54v-8a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v8"/>` +
      `<path d="M54 70v10h12V70"/>` +
      GROUND(12, 108),
  },
];

export type SpotPreset = { id: string; name: string; keywords: string[] };

export const SPOTS: SpotPreset[] = SPOT_DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  keywords: Array.from(new Set([...d.id.split("-"), ...d.k.split(" "), "illustration", "spot", "drawing", "graphic", "picture", "artwork"])),
}));

const SPOT_BY_ID = new Map(SPOT_DEFS.map((d) => [d.id, d]));

export type SpotOptions = {
  /** Pixel size. `null` emits a size-less svg sized by CSS. Default 200. */
  size?: number | null;
  /** Stroke colour. Defaults to currentColor — leave it alone unless you must. */
  color?: string;
  /** The soft shape behind the drawing: `false` to drop it, or a colour of its own. */
  accent?: boolean | string;
  /** Default 4. Anything outside 3-5 breaks the family. */
  strokeWidth?: number;
  className?: string;
  /** Accessible name. Omitted = aria-hidden, right for a decorative spot. */
  title?: string;
};

/** A 120x120 spot illustration as a standalone `<svg>` string. */
export function spotSvg(id: string, opts: SpotOptions = {}): string | null {
  const def = SPOT_BY_ID.get(id);
  if (!def) return null;
  return wrap(SPOT_VIEWBOX, def.body, SPOT_ACCENT, opts, 200);
}

function wrap(
  viewBox: string,
  body: string,
  accentPath: string,
  opts: SpotOptions,
  defaultSize: number,
  aspect = 1,
): string {
  const { size = defaultSize, color = "currentColor", accent = true, strokeWidth = SPOT_STROKE, className, title } = opts;
  const dims = size == null ? "" : ` width="${size}" height="${Math.round(size / aspect)}"`;
  const back =
    accent === false
      ? ""
      : `<path d="${accentPath}" fill="${accent === true ? color : accent}" opacity=".13" stroke="none"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${dims} fill="none" stroke="${color}"` +
    ` stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` +
    `${attr("class", className)}${label(title)}>${back}${body}</svg>`
  );
}

// ---------------------------------------------------------------------------
// 3. DECORATIVE MARKS
//
// The small hand-drawn gestures that stop a heading looking like a wireframe:
// something under the word you want emphasised, something pointing at the
// button, quote marks around the testimonial. Sized to sit with type, so these
// carry their own canvases and a lighter default pen than the spots.
// ---------------------------------------------------------------------------

type MarkDef = {
  id: string;
  name: string;
  k: string;
  /** Aspect: canvas width / height, for the default pixel size. */
  vb: string;
  body: string;
  /** Default stroke width on that canvas. 0 for a filled mark. */
  sw: number;
  /** How this one is meant to be positioned. */
  use: string;
};

// Filled marks get a same-colour round-joined stroke, which rounds their
// corners without a single extra coordinate.
const FILLED = (d: string) => `<path d="${d}" fill="currentColor" stroke="currentColor" stroke-width="3"/>`;

const MARK_DEFS: MarkDef[] = [
  {
    id: "underline-swash",
    name: "Underline swash",
    k: "underline swash brush stroke emphasis highlight heading hand drawn accent",
    vb: "0 0 200 24",
    sw: 5,
    body: `<path d="M6 15C52 6 124 5 194 12"/>`,
    use: "Sit it under a heading word: wrap the word in a relative inline-block and absolutely position this at -bottom-1 left-0 w-full.",
  },
  {
    id: "underline-double",
    name: "Double underline",
    k: "underline double sketch line emphasis heading rough two lines accent",
    vb: "0 0 200 24",
    sw: 4,
    body: `<path d="M6 12C56 5 130 5 192 9"/><path d="M16 20c46-5 112-5 162-2" opacity=".55"/>`,
    use: "Same placement as the swash — a relative inline-block around the word, this absolutely positioned beneath it.",
  },
  {
    id: "underline-zigzag",
    name: "Zigzag underline",
    k: "zigzag underline squiggle wavy playful emphasis heading spellcheck accent",
    vb: "0 0 200 24",
    sw: 4,
    body: `<path d="m6 17 16-9 16 9 16-9 16 9 16-9 16 9 16-9 16 9 16-9 16 9 16-9"/>`,
    use: "Under a heading word, or as a thin full-width rule between two short sections.",
  },
  {
    id: "highlight",
    name: "Marker highlight",
    k: "highlight marker pen background text emphasis yellow swipe behind word",
    vb: "0 0 200 44",
    sw: 0,
    body: `<path d="M9 13c50-7 132-8 183-4 5 8 3 22-2 28-56 8-128 7-181-1-5-6-6-17 0-23Z" fill="currentColor" opacity=".22"/>`,
    use: "Behind text, not under it. Wrap the phrase in a `relative inline-block px-2`, put this svg FIRST as `absolute inset-0 h-full w-full text-yellow-300`, then the words in a `relative` span after it — DOM order, not a negative z-index, which would drop it behind the section's own background.",
  },
  {
    id: "circle-emphasis",
    name: "Circled emphasis",
    k: "circle ring loop around word emphasis hand drawn oval highlight annotate",
    vb: "0 0 220 90",
    sw: 4,
    body: `<path d="M182 22C142 7 62 4 31 25 4 43 21 73 78 81c62 9 122-3 130-25 4-14-12-26-28-30"/>`,
    use: "Wrap the phrase in a relative inline-block with a little padding, then absolutely position this inset-0.",
  },
  {
    id: "sparkle",
    name: "Sparkle",
    k: "starburst star burst shine new ai magic twinkle decoration accent glint",
    vb: "0 0 48 48",
    sw: 0,
    body: FILLED("M24 3c2 12 9 19 21 21-12 2-19 9-21 21-2-12-9-19-21-21 12-2 19-9 21-21Z"),
    use: "Drop beside a badge, a price or an 'AI' label. One is an accent; three is a pattern.",
  },
  {
    id: "sparkle-trio",
    name: "Sparkle trio",
    k: "sparkles stars three magic ai new premium shine decoration cluster",
    vb: "0 0 64 64",
    sw: 0,
    body:
      `<g fill="currentColor" stroke="currentColor" stroke-width="2">` +
      `<path d="M22 14c1.6 9.6 7.2 15.2 16.8 16.8C29.2 32.4 23.6 38 22 47.6 20.4 38 14.8 32.4 5.2 30.8 14.8 29.2 20.4 23.6 22 14Z"/>` +
      `<path d="M50 8c.7 4.2 3.1 6.6 7.3 7.3-4.2.7-6.6 3.1-7.3 7.3-.7-4.2-3.1-6.6-7.3-7.3C46.9 14.6 49.3 12.2 50 8Z"/>` +
      `<path d="M48 40c.6 3.4 2.5 5.3 5.9 5.9-3.4.6-5.3 2.5-5.9 5.9-.6-3.4-2.5-5.3-5.9-5.9 3.4-.6 5.3-2.5 5.9-5.9Z"/>` +
      `</g>`,
    use: "For 'new', 'AI-powered' or a premium tier — anywhere one sparkle would look lonely.",
  },
  {
    id: "arrow-curve",
    name: "Curved arrow",
    k: "arrow curved pointer hand drawn annotate point at cta this way swoosh",
    vb: "0 0 96 72",
    sw: 4,
    body: `<path d="M8 12c26-6 58 4 68 32"/><path d="m80 29-4 15-13-9"/>`,
    use: "Point it at the call-to-action. Rotate with a Tailwind rotate-* / -scale-x-100 class to aim it anywhere.",
  },
  {
    id: "arrow-sketch",
    name: "Sketch arrow",
    k: "arrow straight sketch hand drawn pointer direction next step annotate",
    vb: "0 0 110 48",
    sw: 4,
    body: `<path d="M6 26c34-7 68-4 96-2"/><path d="m88 14 14 10-14 10"/>`,
    use: "Between two steps in a process row, or beside a 'start here' label.",
  },
  {
    id: "bracket-pair",
    name: "Brackets",
    k: "bracket brackets parenthesis frame around heading enclose emphasis pair",
    vb: "0 0 200 80",
    sw: 4,
    body: `<path d="M30 8C10 22 10 58 30 72"/><path d="M170 8c20 14 20 50 0 64"/>`,
    use: "Frame a short heading — the svg spans the heading's width and the brackets land at either end.",
  },
  {
    id: "quote-marks",
    name: "Quote marks",
    k: "quote quotes testimonial review speech marks punctuation opening pull quote",
    vb: "0 0 72 48",
    sw: 0,
    body: FILLED("M8 10h18v16c0 8-6 14-14 16v-8c4-2 6-5 6-10H8Z") + FILLED("M42 10h18v16c0 8-6 14-14 16v-8c4-2 6-5 6-10H42Z"),
    use: "Above a testimonial, at 20-40% opacity, or full strength in the brand colour as a pull-quote mark. Add a rotate-180 class for the closing pair.",
  },
];

export type MarkPreset = { id: string; name: string; keywords: string[]; usage: string; viewBox: string };

export const MARKS: MarkPreset[] = MARK_DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  usage: d.use,
  viewBox: d.vb,
  keywords: Array.from(new Set([...d.id.split("-"), ...d.k.split(" "), "decoration", "decorative", "mark", "flourish"])),
}));

const MARK_BY_ID = new Map(MARK_DEFS.map((d) => [d.id, d]));

export type MarkOptions = { width?: number | null; color?: string; strokeWidth?: number; className?: string };

/** A decorative mark as a standalone `<svg>` string, sized by width. */
export function markSvg(id: string, opts: MarkOptions = {}): string | null {
  const def = MARK_BY_ID.get(id);
  if (!def) return null;
  const { width = null, color = "currentColor", className } = opts;
  const [, , vw, vh] = def.vb.split(" ").map(Number);
  const dims = width == null ? "" : ` width="${width}" height="${Math.round((width * vh) / vw)}"`;
  const pen = def.sw === 0 ? "" : ` stroke="${color}" stroke-width="${opts.strokeWidth ?? def.sw}"`;
  const paint = def.sw === 0 ? ` color="${color}"` : ` fill="none"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${def.vb}"${dims}${paint}${pen}` +
    ` stroke-linecap="round" stroke-linejoin="round"${attr("class", className)} aria-hidden="true">${def.body}</svg>`
  );
}

// ---------------------------------------------------------------------------
// 4. EMPTY-STATE AND PLACEHOLDER ART
//
// The panel every generated site needs and never has: "no items yet", "nothing
// matched that search", "we couldn't load this". Wider canvas than a spot
// (160x120) because these sit centred in a panel, same pen and same accent.
// ---------------------------------------------------------------------------

export const EMPTY_VIEWBOX = "0 0 160 120";

type EmptyDef = { id: string; name: string; k: string; body: string; caption: string };

const EMPTY_DEFS: EmptyDef[] = [
  {
    id: "no-items",
    name: "No items yet",
    k: "empty nothing none blank no items list first time onboarding open box",
    caption: "Nothing here yet",
    body:
      `<path d="M28 58 80 40l52 18-52 18Z"/>` +
      `<path d="M28 58v32l52 18V76"/>` +
      `<path d="M132 58v32l-52 18"/>` +
      `<rect x="64" y="12" width="32" height="20" rx="5" stroke-dasharray="7 7"/>`,
  },
  {
    id: "no-results",
    name: "No results",
    k: "search empty no results nothing found filter query zero matches magnifier",
    caption: "No results found",
    body:
      `<rect x="20" y="24" width="112" height="72" rx="8" stroke-dasharray="9 9"/>` +
      `<path d="M40 46h44M40 60h30"/>` +
      `<circle cx="98" cy="70" r="20"/>` +
      `<path d="m113 85 15 15"/>`,
  },
  {
    id: "no-messages",
    name: "No messages",
    k: "inbox empty no messages chat enquiries none unread conversation quiet",
    caption: "No messages yet",
    body:
      `<path d="M34 26h92a10 10 0 0 1 10 10v42a10 10 0 0 1-10 10H62L42 106V88H34a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10Z"/>` +
      `<path d="M52 48h56M52 64h34" stroke-dasharray="8 8"/>`,
  },
  {
    id: "empty-cart",
    name: "Empty cart",
    k: "cart basket empty shopping no orders checkout nothing added ecommerce",
    caption: "Your basket is empty",
    body:
      `<path d="M18 28h16l12 50h60l12-34H42"/>` +
      `<circle cx="56" cy="98" r="8"/>` +
      `<circle cx="98" cy="98" r="8"/>` +
      `<path d="M62 56h34" stroke-dasharray="8 8"/>`,
  },
  {
    id: "load-error",
    name: "Load error",
    k: "error broken failed offline disconnected problem unplugged retry oops",
    caption: "Something went wrong",
    body:
      `<path d="M14 62h34M112 62h34"/>` +
      `<rect x="48" y="46" width="22" height="32" rx="7"/>` +
      `<rect x="90" y="46" width="22" height="32" rx="7"/>` +
      `<path d="M70 54h8M70 70h8"/>` +
      `<path d="m84 16-8 14h10l-8 14"/>`,
  },
  {
    id: "all-done",
    name: "All done",
    k: "success done complete confirmed thank you sent tick check submitted",
    caption: "All done",
    body:
      `<circle cx="80" cy="64" r="32"/>` +
      `<path d="m66 64 11 11 24-24"/>` +
      `<path d="M80 18v-9M114 30l7-7M46 30l-7-7M126 64h9M25 64h9"/>`,
  },
  {
    id: "image-placeholder",
    name: "Image placeholder",
    k: "image placeholder photo picture missing frame gallery thumbnail no photo",
    caption: "Image",
    body:
      `<rect x="20" y="22" width="120" height="80" rx="8"/>` +
      `<path d="m32 92 30-34 20 22 14-12 24 24"/>` +
      `<circle cx="106" cy="46" r="9"/>`,
  },
  {
    id: "coming-soon",
    name: "Coming soon",
    k: "coming soon under construction work in progress pending building cone",
    caption: "Coming soon",
    body:
      `<path d="M58 96 80 34l22 62Z"/>` +
      `<path d="M72 62h16M67 79h26"/>` +
      `<path d="M50 100h60"/>` +
      `<path d="M22 100h20M118 100h20" stroke-dasharray="1 11"/>`,
  },
];

export type EmptyStatePreset = { id: string; name: string; keywords: string[]; caption: string };

export const EMPTY_STATES: EmptyStatePreset[] = EMPTY_DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  caption: d.caption,
  keywords: Array.from(
    new Set([
      ...d.id.split("-"),
      ...d.k.split(" "),
      "empty",
      "state",
      "placeholder",
      "illustration",
      "panel",
      "zero",
    ]),
  ),
}));

const EMPTY_BY_ID = new Map(EMPTY_DEFS.map((d) => [d.id, d]));

/** A 160x120 empty-state illustration as a standalone `<svg>` string. */
export function emptyStateSvg(id: string, opts: SpotOptions = {}): string | null {
  const def = EMPTY_BY_ID.get(id);
  if (!def) return null;
  return wrap(EMPTY_VIEWBOX, def.body, WIDE_ACCENT, opts, 240, 160 / 120);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getBackdrop(id: string): BackdropPreset | undefined {
  return BACKDROPS.find((b) => b.id === id);
}

export function getSpot(id: string): SpotPreset | undefined {
  return SPOTS.find((s) => s.id === id);
}

export function getMark(id: string): MarkPreset | undefined {
  return MARKS.find((m) => m.id === id);
}

export function getEmptyState(id: string): EmptyStatePreset | undefined {
  return EMPTY_STATES.find((e) => e.id === id);
}

/**
 * Brand kit — a customer's own logo, palette and business name, in a form the
 * builder can actually use.
 *
 * WHY THIS SHAPE, AND NOT A FONT PICKER OR AN UPLOAD BUCKET
 * Generated sites are static files served under
 *   default-src 'self'; img-src 'self' data:; connect-src 'none'
 * with NO font-src (see app/api/site/[slug]/[[...path]]/route.ts). Three
 * consequences drive every decision in this file:
 *
 *  1. There is no remote asset host and no upload CDN, so a logo has to be
 *     INLINED — either as SVG markup compiled into a component, or as a data:
 *     URI. `img-src` admits `data:`, which is the only reason raster works at all.
 *
 *  2. Custom web fonts are impossible, base64 included. With no `font-src`,
 *     @font-face falls back to `default-src 'self'`, which does NOT admit
 *     `data:` the way `img-src` does. A base64 font is blocked exactly like a
 *     remote one, so there is deliberately no typography field here. Type is the
 *     system stack, as lib/agent.ts already tells the builder.
 *
 *  3. Everything here passes through the model's context as tokens on every
 *     turn of every build, forever — the logo lives in a source file, and
 *     lib/agent.ts's describeFiles() dumps the whole source tree into each
 *     request. Size is recurring cost, not a one-off. See LOGO_LIMITS below for
 *     the arithmetic that sets the caps.
 *
 * WHERE A BRAND KIT LIVES
 * prisma/schema.prisma has no BrandKit model and must not gain one, but
 * ProjectFile.content is a plain String and ProjectFile.kind is a plain String
 * whose only existing values are "source" and "build". A third value, "brand",
 * gives the kit a row of its own that every existing query already ignores:
 *   - the agent never sees it (generate reads kind:"source")
 *   - it is never served (site/preview read kind:"build")
 *   - it is never exported or published
 *   - it DOES survive project duplication (POST /api/projects/[id] copies every
 *     draft file regardless of kind) and build restore (which only clears the
 *     "source" and "build" draft trees) — both of which are the behaviour you want.
 */

import { GRADIENTS, type GradientPreset } from "./assets/patterns";

// ---------------------------------------------------------------------------
// Storage contract
// ---------------------------------------------------------------------------

/** ProjectFile.kind for the row holding the serialised kit. Not "source"/"build". */
export const BRAND_FILE_KIND = "brand";
/** ProjectFile.path for that row. Never reachable by the agent — see above. */
export const BRAND_FILE_PATH = "brand.json";

/**
 * The generated component the kit compiles the logo into. A real source file so
 * the builder can `import { BrandLogo } from "./components/brand/BrandLogo"`
 * and place it, rather than being handed raw markup to paste (and mangle).
 */
export const BRAND_LOGO_COMPONENT_PATH = "src/components/brand/BrandLogo.tsx";
/** The stylesheet the @theme block is spliced into. */
export const BRAND_CSS_PATH = "src/index.css";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type BrandLogo =
  | {
      format: "svg";
      /** Sanitised markup — output of sanitizeSvg(), never raw upload. */
      markup: string;
    }
  | {
      format: "raster";
      /** `data:image/png;base64,...` — verified media type and magic bytes. */
      dataUri: string;
      mediaType: "image/png" | "image/jpeg" | "image/webp";
      width: number;
      height: number;
    };

export type BrandPalette = {
  /**
   * The id of a preset in lib/assets/patterns.ts's GRADIENTS catalogue, or null
   * for hand-picked hexes. Sent to the model ALONGSIDE the hexes, never instead
   * of them: the id is a stable handle the catalogue already uses everywhere
   * else, the hexes are what the site is actually painted with.
   */
  presetId: string | null;
  /** All six are exact `#rrggbb`, lowercase. Never adjectives. */
  primary: string;
  secondary: string;
  accent: string;
  /** Body text colour on `surface`. */
  ink: string;
  /** Page background. */
  surface: string;
};

export type BrandKit = {
  version: 1;
  businessName: string;
  palette: BrandPalette;
  logo: BrandLogo | null;
  /** ISO timestamp of the last save. */
  updatedAt: string;
};

export const BUSINESS_NAME_MAX = 80;

// ---------------------------------------------------------------------------
// Size caps, and the arithmetic behind them
// ---------------------------------------------------------------------------

/**
 * TOKEN COST OF A LOGO — the numbers these caps come from.
 *
 * Base rates. The builder is claude-sonnet-5 at $3 / MTok input
 * (lib/models.ts, MODEL_RATES). Base64 of compressed image data is
 * high-entropy and tokenises at roughly 3 characters per token; SVG markup,
 * with its repeated tag names and digit runs, comes out slightly better at
 * roughly 3.2. Both are measured-ballpark, and both are conservative in the
 * direction that matters (they under-count tokens, so the real bill is not
 * worse than this).
 *
 * A logo is not paid for once. It lives in a source file, so lib/agent.ts's
 * describeFiles() re-sends it in the user message of EVERY turn — and the user
 * message is not the cached block (only SYSTEM carries cache_control). A build
 * runs up to 8 turns and typically 3-4, and a project has many builds.
 * Multiply accordingly: cost = tokens x turns x builds.
 *
 * The naive option, for scale. A 200 KB PNG dropped in unmodified:
 *   200 KB -> ceil(200000/3)*4 = 266,668 base64 chars
 *   266,668 / 3 = ~88,900 tokens
 *   x $3/MTok = $0.267 per turn -> ~$1.07 over a 4-turn build.
 * That is more than the entire rest of the build. Rejected.
 *
 * SVG cap: 12,288 characters of SANITISED markup (12 KiB).
 *   12,288 / 3.2 = ~3,840 tokens -> $0.0115 per turn -> ~$0.046 per 4-turn build.
 * Real vector logos land at 1-6 KB after sanitising strips the editor metadata,
 * so the cap bites only on auto-traced artwork, which is the case you want to
 * refuse anyway. The raw upload is allowed to be 5x that (SVG_RAW_MAX) because
 * Illustrator/Inkscape junk is exactly what the sanitiser deletes.
 *
 * Raster cap: 16,384 characters of data URI (16 KiB).
 *   16,384 / 3 = ~5,460 tokens -> $0.0164 per turn -> ~$0.066 per 4-turn build.
 * The UI downscales to RASTER_MAX_EDGE = 160 px before encoding, which is what
 * makes that cap reachable: a 160 px flat-colour logo PNG is 4-12 KB, i.e.
 * 5.3-16 KB of base64. 160 px renders crisply up to ~80 CSS px — a header
 * lockup at 2x — and a customer who wants their logo bigger than that wants SVG.
 *
 * Budget check: a build sends the whole source tree, ~15-25k tokens per turn.
 * At 3.8-5.5k tokens the logo is a ~20% surcharge on a first build and less
 * afterwards. That is the honest number; it is the price of the feature, and it
 * is two orders of magnitude below the naive option.
 */
export const LOGO_LIMITS = {
  /** Hard cap on the raw upload handed to the sanitiser. */
  SVG_RAW_MAX: 64 * 1024,
  /** Hard cap on the sanitiser's OUTPUT — the thing that actually costs tokens. */
  SVG_CLEAN_MAX: 12 * 1024,
  /** Hard cap on the whole `data:...` string. */
  RASTER_DATA_URI_MAX: 16 * 1024,
  /** Longest edge the UI downscales a raster logo to before encoding. */
  RASTER_MAX_EDGE: 160,
} as const;

/** Chars-per-token used above. Exposed so the UI quotes the same number the docs do. */
const CHARS_PER_TOKEN = { svg: 3.2, base64: 3 } as const;

/** Roughly what this logo adds to every turn of every build. */
export function logoTokenEstimate(logo: BrandLogo | null): number {
  if (!logo) return 0;
  return logo.format === "svg"
    ? Math.ceil(logo.markup.length / CHARS_PER_TOKEN.svg)
    : Math.ceil(logo.dataUri.length / CHARS_PER_TOKEN.base64);
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** `#abc`, `abc`, `#AABBCC` -> `#aabbcc`. Null when it is not a hex colour. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear sRGB mix. t=0 returns `a`, t=1 returns `b`. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const NEAR_BLACK = "#0b1120";
const NEAR_WHITE = "#ffffff";

/**
 * The readable text colour to put ON `bg`. Near-black wins ties, because a
 * light-on-mid-tone pairing is the exact failure this codebase already carries
 * as a known accepted issue on its own brand gradient — the brand kit must not
 * reproduce it on a customer's site.
 */
export function readableInk(bg: string): string {
  const dark = contrastRatio(bg, NEAR_BLACK);
  const light = contrastRatio(bg, NEAR_WHITE);
  return dark >= light ? NEAR_BLACK : NEAR_WHITE;
}

/**
 * A 50-950 tint/shade ramp anchored so that 500 IS the customer's colour.
 * Mixing in sRGB rather than a perceptual space is deliberate: it is
 * dependency-free, deterministic, and its output is a family of colours the
 * customer can recognise as theirs, which is the whole requirement.
 */
const RAMP_STEPS: [step: number, toward: "white" | "black", t: number][] = [
  [50, "white", 0.95],
  [100, "white", 0.9],
  [200, "white", 0.78],
  [300, "white", 0.62],
  [400, "white", 0.35],
  [500, "white", 0],
  [600, "black", 0.12],
  [700, "black", 0.28],
  [800, "black", 0.45],
  [900, "black", 0.6],
  [950, "black", 0.74],
];

export function colorRamp(base: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [step, toward, t] of RAMP_STEPS) {
    out[step] = t === 0 ? base : mix(base, toward === "white" ? NEAR_WHITE : "#000000", t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Palette — sourced from the existing catalogue, never a second vocabulary
// ---------------------------------------------------------------------------

/**
 * A catalogue gradient turned into a full palette.
 *
 * primary/secondary are the gradient's own end stops, so "ocean" here is the
 * same ocean the find_assets tool returns to the builder. The accent is derived
 * rather than invented: the hue opposite the primary, at the primary's own
 * saturation and lightness, which gives a colour that reads as deliberate
 * against the pair without introducing a third brand decision the customer
 * never made.
 */
export function paletteFromPreset(presetId: string): BrandPalette | null {
  const preset: GradientPreset | undefined = GRADIENTS.find((g) => g.id === presetId);
  if (!preset) return null;

  const primary = normalizeHex(preset.colors[0]);
  const secondary = normalizeHex(preset.colors[preset.colors.length - 1]);
  if (!primary || !secondary) return null;

  // Three-stop presets (aurora) already ship a middle colour that was chosen to
  // sit between the ends; use it rather than computing one.
  const middle = preset.colors.length > 2 ? normalizeHex(preset.colors[1]) : null;
  const accent = middle ?? complement(primary);

  const dark = luminance(primary) < 0.22 && luminance(secondary) < 0.22;
  return {
    presetId: preset.id,
    primary,
    secondary,
    accent,
    // A dark-family preset (midnight, ink, deep-sea) gets a dark surface; every
    // other preset stays on near-white, because a mid-tone page background is
    // where legibility goes to die.
    ink: dark ? "#f8fafc" : NEAR_BLACK,
    surface: dark ? "#0b1120" : "#ffffff",
  };
}

function complement(hex: string): string {
  const [r, g, b] = channels(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 180 + 360) % 360;
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = rgb[seg];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export type PaletteChoice = {
  id: string;
  name: string;
  family: string;
  colors: string[];
  css: string;
  palette: BrandPalette;
};

/** The catalogue, flattened to exactly what a palette picker needs. */
export function paletteCatalogue(): PaletteChoice[] {
  const out: PaletteChoice[] = [];
  for (const g of GRADIENTS) {
    const palette = paletteFromPreset(g.id);
    if (!palette) continue;
    out.push({ id: g.id, name: g.name, family: g.family, colors: g.colors, css: g.css, palette });
  }
  return out;
}

/** The gradient CSS for a kit — the preset's own when there is one, else the pair. */
export function brandGradientCss(palette: BrandPalette): string {
  const preset = palette.presetId ? GRADIENTS.find((g) => g.id === palette.presetId) : undefined;
  if (preset) return preset.css;
  return `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`;
}

// ---------------------------------------------------------------------------
// SVG sanitising
//
// AN UPLOADED SVG IS UNTRUSTED CODE, NOT A PICTURE. It gets inlined into a page
// served from *.kodely.site under a CSP that permits 'unsafe-inline' script, so
// a single surviving `onload=` is stored XSS on the customer's own domain.
//
// The design here is allowlist-only and, critically, RE-SERIALISING: nothing
// from the input reaches the output as bytes. Element names come from a fixed
// table, attribute names come from a fixed table, and every value is validated
// against a per-attribute pattern and then re-escaped by our own writer. A
// parser differential between this scanner and a browser can therefore produce
// a mangled logo, but it cannot produce an attribute or an element that is not
// on these lists.
//
// Two distinct responses, on purpose:
//   REJECT — anything whose presence means the file is an attack or a trap
//            (script, event handlers, foreignObject, entity subsets, CDATA,
//            non-local hrefs). Silently stripping these would hide an attack;
//            a customer uploading a real logo never trips them.
//   STRIP  — anything merely unknown (editor metadata, sodipodi/inkscape
//            namespaces, filters, animation). Reported back so the UI can say
//            what was dropped.
// ---------------------------------------------------------------------------

/** Elements that survive. 19 of them. Everything else is stripped with its subtree. */
const ALLOWED_ELEMENTS = [
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "use",
  "symbol",
] as const;

/** Lowercased name -> canonical SVG spelling, so `<LINEARGRADIENT>` still resolves. */
const ELEMENT_CANON = new Map(ALLOWED_ELEMENTS.map((n) => [n.toLowerCase(), n as string]));

/**
 * Present at all -> the upload is refused. These are not "unknown", they are
 * the attack. `set` and `animate*` are here because they can retarget an
 * attribute at runtime (`<set attributeName="href" to="javascript:...">`),
 * which would route around every value check below.
 */
const FORBIDDEN_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "handler",
  "style",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "audio",
  "video",
  "image",
  "feimage",
  "a",
]);

const TEXT_ATTRS = [
  "x",
  "y",
  "dx",
  "dy",
  "text-anchor",
  "dominant-baseline",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
];

/** Allowed on every element. Note the absence of `style`, `class` and `href`. */
const GLOBAL_ATTRS = [
  "id",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "opacity",
  "color",
  "clip-path",
  "mask",
  "vector-effect",
];

const ELEMENT_ATTRS: Record<string, string[]> = {
  // width/height are accepted on <svg> only so a viewBox can be synthesised
  // from them; they are deleted from the root before serialising, because fixed
  // pixel dimensions fight the className the builder sizes the logo with.
  svg: ["viewBox", "preserveAspectRatio", "width", "height"],
  g: [],
  defs: [],
  path: ["d"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  text: TEXT_ATTRS,
  tspan: TEXT_ATTRS,
  linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod"],
  radialGradient: [
    "cx",
    "cy",
    "r",
    "fx",
    "fy",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
  ],
  stop: ["offset", "stop-color", "stop-opacity"],
  clipPath: ["clipPathUnits"],
  mask: ["maskUnits", "maskContentUnits", "x", "y", "width", "height"],
  use: ["href", "x", "y", "width", "height"],
  symbol: ["viewBox", "preserveAspectRatio"],
};

/** Lowercased attribute name -> canonical spelling (viewBox, gradientUnits, ...). */
const ATTR_CANON = new Map<string, string>();
for (const name of [...GLOBAL_ATTRS, ...Object.values(ELEMENT_ATTRS).flat()]) {
  ATTR_CANON.set(name.toLowerCase(), name);
}

type ValueKind = "num" | "numlist" | "paint" | "pathdata" | "transform" | "keyword" | "href" | "id";

const ATTR_KIND: Record<string, ValueKind> = {
  id: "id",
  transform: "transform",
  gradientTransform: "transform",
  d: "pathdata",
  points: "pathdata",
  fill: "paint",
  stroke: "paint",
  color: "paint",
  "stop-color": "paint",
  "clip-path": "paint",
  mask: "paint",
  href: "href",
  "stroke-linecap": "keyword",
  "stroke-linejoin": "keyword",
  "fill-rule": "keyword",
  "clip-rule": "keyword",
  "vector-effect": "keyword",
  gradientUnits: "keyword",
  spreadMethod: "keyword",
  clipPathUnits: "keyword",
  maskUnits: "keyword",
  maskContentUnits: "keyword",
  preserveAspectRatio: "keyword",
  "text-anchor": "keyword",
  "dominant-baseline": "keyword",
  "font-family": "keyword",
  "font-weight": "keyword",
  "font-style": "keyword",
};

/**
 * CSS properties lifted out of a `style="..."` attribute. The attribute itself
 * is never kept: a style string can carry `url(...)`, comment-splitting and
 * legacy `expression()`, and it would also have to become a JSX object later.
 * Instead each declaration is converted to the equivalent PRESENTATION
 * ATTRIBUTE and run through the same validators as if it had been written that
 * way. Anything not on this list is dropped.
 */
const STYLE_TO_ATTR = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "opacity",
  "color",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
]);

const TRANSFORM_FUNCTIONS = new Set(["matrix", "translate", "scale", "rotate", "skewx", "skewy"]);

const RE = {
  num: /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:px|pt|pc|mm|cm|in|em|rem|ex|%)?$/,
  numlist: /^[-+0-9.eE,%\s]+$/,
  pathdata: /^[-+0-9.eE,\s AaCcHhLlMmQqSsTtVvZz]+$/,
  transform: /^[-+0-9.eE,\s()a-zA-Z]+$/,
  // A leading quote is allowed so a quoted font stack ('Helvetica Neue', ...)
  // survives. A double quote is not: the value is re-escaped to &quot; on
  // output and then has to survive a second trip through JSX attribute parsing
  // in the generated component.
  keyword: /^['a-zA-Z][a-zA-Z0-9 ,'._-]*$/,
  hexColor: /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  rgbHsl: /^(?:rgb|rgba|hsl|hsla)\(\s*[-+0-9.,%\s/]+\)$/,
  id: /^[A-Za-z_][A-Za-z0-9_-]*$/,
} as const;

const PAINT_KEYWORDS = new Set(["none", "currentcolor", "transparent", "inherit"]);

/** Bounds on the parsed tree, so a pathological file cannot burn CPU. */
const MAX_NODES = 4000;
const MAX_DEPTH = 24;

export type SanitizeResult =
  | { ok: true; svg: string; removed: string[] }
  | { ok: false; reason: string };

type SvgElement = { kind: "el"; name: string; attrs: Map<string, string>; children: SvgNode[] };
type SvgNode = SvgElement | { kind: "text"; value: string };

/**
 * Decode the entity forms an attribute value can legitimately carry, so
 * validation sees what a browser would see. Without this,
 * `href="&#106;avascript:alert(1)"` passes a naive `startsWith("#")` check.
 * Unknown `&foo;` sequences are left as a literal `&` and re-escaped on output.
 */
function decodeEntities(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
    };
    return named[body.toLowerCase()] ?? whole;
  });
}

/**
 * Drop C0/C1 control characters, which are how  gets past a
 * naive prefix test. Written as a loop rather than a character-class regex on
 * purpose: a regex literal containing control escapes trips ,
 * and an eslint-disable comment for a rule that may not be enabled would itself
 * be reported as an unused directive.
 *
 * Tab, newline and carriage return survive — path data legitimately wraps.
 */
function stripControls(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      out += ch;
      continue;
    }
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

/**
 * Sanitise an uploaded SVG down to inlinable markup.
 *
 * The full contract, stated plainly because getting it wrong is stored XSS:
 *
 * ELEMENTS KEPT (19, everything else stripped with its subtree):
 *   svg g defs path rect circle ellipse line polyline polygon text tspan
 *   linearGradient radialGradient stop clipPath mask use symbol
 *   No filters (feImage can load a remote document), no animation, no <a>,
 *   no <style>, no <title>/<desc> (we supply our own aria-label instead).
 *
 * ATTRIBUTES KEPT: the fixed per-element table above plus the global paint and
 *   geometry set. `style` is decomposed into presentation attributes and then
 *   discarded. `class`, `xmlns:*` beyond the SVG namespace, `data-*` and every
 *   `on*` are gone.
 *
 * REFERENCES: every `id` is renumbered to `bk1..bkN` and every `url(#...)` and
 *   `href="#..."` is rewritten to point at the renumbered id. A reference to an
 *   id we did not mint is dropped (and a `<use>` that loses its href is dropped
 *   with it). This both prevents the logo colliding with ids already on the
 *   page and makes an off-document reference structurally impossible.
 *
 * OUTRIGHT REFUSAL (returns ok:false):
 *   `<script>`, `<foreignObject>`, `<style>`, `<a>`, `<image>`/`<feImage>`,
 *   `<iframe>/<object>/<embed>`, any animation element, any `on*` attribute,
 *   any `href`/`xlink:href` that is not a bare `#fragment`, any `javascript:`
 *   or `data:` in an attribute value, a `<!DOCTYPE>` carrying an internal
 *   subset or an `ENTITY`, and `<![CDATA[`.
 */
export function sanitizeSvg(input: string): SanitizeResult {
  if (typeof input !== "string") return { ok: false, reason: "That wasn't a file we could read." };
  const src = input.trim();
  if (!src) return { ok: false, reason: "The file was empty." };
  if (src.length > LOGO_LIMITS.SVG_RAW_MAX) {
    return {
      ok: false,
      reason: `That SVG is ${Math.round(src.length / 1024)} KB. The limit is ${
        LOGO_LIMITS.SVG_RAW_MAX / 1024
      } KB before cleaning.`,
    };
  }

  // Entity expansion (billion laughs) and external-entity reads both need a
  // DTD internal subset. A plain public-identifier DOCTYPE is what Illustrator
  // emits and is harmless, so that one is stripped rather than refused.
  const doctype = /<!DOCTYPE[^>]*(?:\[[\s\S]*?\])?[^>]*>/i.exec(src);
  if (doctype && (/\bENTITY\b/i.test(doctype[0]) || doctype[0].includes("["))) {
    return { ok: false, reason: "That SVG declares XML entities, which we don't accept." };
  }
  if (/<!\[CDATA\[/i.test(src)) {
    return { ok: false, reason: "That SVG contains a CDATA section, which we don't accept." };
  }

  const removed = new Set<string>();
  const root: SvgElement = { kind: "el", name: "#root", attrs: new Map(), children: [] };
  const stack: SvgElement[] = [root];
  /** Depth of stripped-but-open elements whose entire subtree we are discarding. */
  let skipDepth = 0;
  let nodes = 0;

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (src.startsWith("<!", lt)) {
      // Only the benign DOCTYPE form reaches here; the dangerous one already
      // returned above. Skip to the matching '>'.
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }

    const closing = src[lt + 1] === "/";
    const tag = readTag(src, lt);
    if (!tag) {
      // A stray '<' in text content. Treat it as text and move on.
      pushText("<");
      i = lt + 1;
      continue;
    }
    i = tag.end;

    const local = localName(tag.name);
    if (FORBIDDEN_ELEMENTS.has(local)) {
      return {
        ok: false,
        reason:
          local === "style"
            ? "That SVG carries a <style> block. Re-export it with style attributes rather than internal CSS."
            : `That SVG contains a <${local}> element, which we never accept.`,
      };
    }

    if (closing) {
      if (skipDepth > 0) {
        skipDepth--;
        continue;
      }
      const canon = ELEMENT_CANON.get(local);
      // Pop to the nearest matching open element; ignore an unmatched close.
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === canon) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    if (skipDepth > 0) {
      if (!tag.selfClosing) skipDepth++;
      continue;
    }

    const canon = ELEMENT_CANON.get(local);
    if (!canon) {
      removed.add(`<${local}>`);
      if (!tag.selfClosing) skipDepth = 1;
      continue;
    }

    if (++nodes > MAX_NODES) {
      return { ok: false, reason: "That SVG has too many shapes to inline into a page." };
    }
    if (stack.length > MAX_DEPTH) {
      return { ok: false, reason: "That SVG is nested too deeply." };
    }

    const attrs = new Map<string, string>();
    for (const [rawName, rawValue] of tag.attrs) {
      const nameLc = rawName.toLowerCase();
      const value = stripControls(decodeEntities(rawValue)).trim();

      if (nameLc.startsWith("on")) {
        return {
          ok: false,
          reason: `That SVG carries an event handler (${rawName}), which we never accept.`,
        };
      }
      // Whitespace removed before the scan: `java script:` with a decoded tab
      // in the middle is the same string to a URL parser.
      if (/javascript:|vbscript:|data:/i.test(value.replace(/\s+/g, ""))) {
        return {
          ok: false,
          reason: `That SVG has a script or data URL in ${rawName}, which we never accept.`,
        };
      }

      if (nameLc === "style") {
        for (const [prop, propValue] of parseStyle(value)) {
          if (!STYLE_TO_ATTR.has(prop)) {
            removed.add(`style:${prop}`);
            continue;
          }
          const allowed = attrAllowed(canon, prop);
          if (!allowed) {
            removed.add(`style:${prop}`);
            continue;
          }
          const clean = validateValue(allowed, propValue);
          if (clean === null) removed.add(`style:${prop}`);
          else attrs.set(allowed, clean);
        }
        continue;
      }

      // xlink:href is the SVG 1.1 spelling of href; every other namespaced
      // attribute (sodipodi:, inkscape:, xml:space, xmlns:*) is editor noise.
      const bare = nameLc === "xlink:href" ? "href" : nameLc.includes(":") ? null : nameLc;
      if (bare === null) {
        if (nameLc !== "xmlns" && !nameLc.startsWith("xmlns:")) removed.add(`@${rawName}`);
        continue;
      }
      if (bare === "xmlns") continue; // re-emitted from a constant on the root

      const allowed = attrAllowed(canon, bare);
      if (!allowed) {
        removed.add(`@${rawName}`);
        continue;
      }

      if (allowed === "href" && !value.startsWith("#")) {
        return {
          ok: false,
          reason: "That SVG links to something outside itself, which we never accept.",
        };
      }

      const clean = validateValue(allowed, value);
      if (clean === null) removed.add(`@${rawName}`);
      else attrs.set(allowed, clean);
    }

    const el: SvgElement = { kind: "el", name: canon, attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!tag.selfClosing) stack.push(el);
  }

  function pushText(raw: string) {
    if (skipDepth > 0) return;
    const parent = stack[stack.length - 1];
    // Text only means anything inside <text>/<tspan>; anywhere else it is
    // whitespace between tags and carrying it just costs tokens.
    if (parent.name !== "text" && parent.name !== "tspan") return;
    const value = stripControls(decodeEntities(raw));
    if (value.trim() === "") return;
    parent.children.push({ kind: "text", value });
  }

  const svg = root.children.find((n): n is SvgElement => n.kind === "el");
  if (!svg || svg.name !== "svg") {
    return { ok: false, reason: "That file doesn't start with an <svg> element." };
  }

  // A viewBox is what lets the logo scale to whatever box the builder puts it
  // in. Synthesise one from width/height when the file only had those.
  if (!svg.attrs.has("viewBox")) {
    const w = numberFrom(svg.attrs.get("width"));
    const h = numberFrom(svg.attrs.get("height"));
    if (w && h) svg.attrs.set("viewBox", `0 0 ${w} ${h}`);
    else return { ok: false, reason: "That SVG has no viewBox, so it can't be scaled." };
  }
  // Fixed pixel dimensions on the root fight the className the builder sets.
  svg.attrs.delete("width");
  svg.attrs.delete("height");

  renumberIds(svg, removed);

  const out = `<svg xmlns="http://www.w3.org/2000/svg"${serializeAttrs(svg)}>${svg.children
    .map(serializeNode)
    .join("")}</svg>`;

  if (out.length > LOGO_LIMITS.SVG_CLEAN_MAX) {
    return {
      ok: false,
      reason: `After cleaning, that logo is ${Math.round(out.length / 1024)} KB — over the ${
        LOGO_LIMITS.SVG_CLEAN_MAX / 1024
      } KB limit. Simplify the artwork or flatten it to fewer paths.`,
    };
  }
  if (!/<(?:path|rect|circle|ellipse|line|polyline|polygon|text|use)\b/.test(out)) {
    return { ok: false, reason: "Nothing drawable survived cleaning that SVG." };
  }

  return { ok: true, svg: out, removed: [...removed].sort() };
}

function localName(name: string): string {
  const lc = name.toLowerCase();
  const colon = lc.lastIndexOf(":");
  return colon === -1 ? lc : lc.slice(colon + 1);
}

function attrAllowed(element: string, lowerName: string): string | null {
  const canon = ATTR_CANON.get(lowerName);
  if (!canon) return null;
  if (GLOBAL_ATTRS.includes(canon)) return canon;
  return (ELEMENT_ATTRS[element] ?? []).includes(canon) ? canon : null;
}

function validateValue(attr: string, value: string): string | null {
  if (value === "" || value.length > 4000) return null;
  const kind: ValueKind = ATTR_KIND[attr] ?? (RE.num.test(value) ? "num" : "numlist");

  switch (kind) {
    case "id":
      return RE.id.test(value) ? value : null;
    case "href":
      return value.startsWith("#") && RE.id.test(value.slice(1)) ? value : null;
    case "paint":
      return validatePaint(value);
    case "pathdata":
      return RE.pathdata.test(value) ? value : null;
    case "transform":
      return validateTransform(value);
    case "keyword":
      return RE.keyword.test(value) ? value : null;
    case "num":
      return RE.num.test(value) ? value : null;
    case "numlist":
      return RE.numlist.test(value) ? value : null;
  }
}

function validatePaint(value: string): string | null {
  const v = value.trim();
  if (PAINT_KEYWORDS.has(v.toLowerCase())) return v;
  if (v.toLowerCase() === "currentcolor") return "currentColor";
  if (RE.hexColor.test(v)) return v;
  if (RE.rgbHsl.test(v)) return v;
  // A local reference, optionally with a fallback paint after it.
  const ref = /^url\(\s*(?:'|")?#([A-Za-z_][A-Za-z0-9_-]*)(?:'|")?\s*\)$/.exec(v);
  if (ref) return `url(#${ref[1]})`;
  return null;
}

function validateTransform(value: string): string | null {
  if (!RE.transform.test(value)) return null;
  for (const m of value.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*\(/g)) {
    if (!TRANSFORM_FUNCTIONS.has(m[1].toLowerCase())) return null;
  }
  return value;
}

function numberFrom(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `fill:#fff; stroke-width:2` -> [["fill","#fff"],["stroke-width","2"]]. */
function parseStyle(value: string): [string, string][] {
  if (value.includes("/*") || value.includes("\\")) return [];
  const out: [string, string][] = [];
  for (const decl of value.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim();
    if (!prop || !val) continue;
    out.push([prop, val]);
  }
  return out;
}

type RawTag = {
  name: string;
  attrs: [string, string][];
  selfClosing: boolean;
  /** Index just past the closing '>'. */
  end: number;
};

/**
 * Read one tag starting at `<`. Quote-aware, so a '>' inside an attribute value
 * does not end the tag early — which is the classic way a naive regex-based
 * stripper gets walked past.
 */
function readTag(src: string, start: number): RawTag | null {
  let p = start + 1;
  if (src[p] === "/") p++;
  const nameStart = p;
  while (p < src.length && /[^\s/>]/.test(src[p])) p++;
  const name = src.slice(nameStart, p);
  if (!name || !/^[A-Za-z_][\w.:-]*$/.test(name)) return null;

  const attrs: [string, string][] = [];
  let selfClosing = false;

  while (p < src.length) {
    while (p < src.length && /\s/.test(src[p])) p++;
    if (p >= src.length) break;
    if (src[p] === ">") {
      p++;
      break;
    }
    if (src[p] === "/" && src[p + 1] === ">") {
      selfClosing = true;
      p += 2;
      break;
    }
    const attrStart = p;
    while (p < src.length && /[^\s=/>]/.test(src[p])) p++;
    const attrName = src.slice(attrStart, p);
    if (!attrName) {
      p++;
      continue;
    }
    while (p < src.length && /\s/.test(src[p])) p++;
    let value = "";
    if (src[p] === "=") {
      p++;
      while (p < src.length && /\s/.test(src[p])) p++;
      const quote = src[p];
      if (quote === '"' || quote === "'") {
        p++;
        const close = src.indexOf(quote, p);
        value = close === -1 ? src.slice(p) : src.slice(p, close);
        p = close === -1 ? src.length : close + 1;
      } else {
        const vs = p;
        while (p < src.length && !/[\s>]/.test(src[p])) p++;
        value = src.slice(vs, p);
      }
    }
    attrs.push([attrName, value]);
  }

  return { name, attrs, selfClosing, end: p };
}

/**
 * Renumber every id to `bk<n>` and repoint every reference at the new name.
 * SVG ids are document-global once inlined, so a logo shipping `id="a"` would
 * silently hijack (or be hijacked by) anything else on the page called "a".
 * The second effect is the security one: only ids we minted can be referenced,
 * so a surviving `url(#...)` cannot address anything outside this logo.
 */
function renumberIds(svg: SvgElement, removed: Set<string>) {
  const map = new Map<string, string>();
  let n = 0;
  walk(svg, (el) => {
    const id = el.attrs.get("id");
    if (id && !map.has(id)) map.set(id, `bk${++n}`);
  });
  walk(svg, (el) => {
    const id = el.attrs.get("id");
    if (id) el.attrs.set("id", map.get(id) as string);
    for (const attr of ["fill", "stroke", "clip-path", "mask", "color", "stop-color", "href"]) {
      const value = el.attrs.get(attr);
      if (!value) continue;
      // A bare `#...` is a reference ONLY on href. On a paint attribute it is a
      // hex colour, and matching it here would silently delete `#f72570` as a
      // dangling id — which is exactly the bug this comment exists to prevent
      // coming back.
      const ref =
        attr === "href"
          ? /^#([A-Za-z_][A-Za-z0-9_-]*)$/.exec(value)
          : /^url\(#([A-Za-z_][A-Za-z0-9_-]*)\)$/.exec(value);
      if (!ref) continue;
      const target = map.get(ref[1]);
      if (!target) {
        el.attrs.delete(attr);
        removed.add(`@${attr} (dangling reference)`);
        continue;
      }
      el.attrs.set(attr, attr === "href" ? `#${target}` : `url(#${target})`);
    }
  });
  // A <use> with no href draws nothing; drop it rather than emit dead markup.
  prune(svg, (el) => el.name === "use" && !el.attrs.has("href"));
}

function walk(el: SvgElement, fn: (el: SvgElement) => void) {
  fn(el);
  for (const child of el.children) if (child.kind === "el") walk(child, fn);
}

function prune(
  el: SvgElement,
  drop: (el: SvgElement) => boolean,
) {
  el.children = el.children.filter((c) => !(c.kind === "el" && drop(c)));
  for (const child of el.children) if (child.kind === "el") prune(child, drop);
}

function serializeAttrs(el: SvgElement): string {
  let out = "";
  for (const [name, value] of el.attrs) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

const VOID_LIKE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "stop", "use"]);

function serializeNode(node: SvgNode): string {
  if (node.kind === "text") return escapeText(node.value);
  const attrs = serializeAttrs(node);
  if (node.children.length === 0 && VOID_LIKE.has(node.name)) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serializeNode).join("")}</${node.name}>`;
}

// ---------------------------------------------------------------------------
// Raster logos
// ---------------------------------------------------------------------------

const RASTER_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type RasterMediaType = (typeof RASTER_MEDIA_TYPES)[number];

export type RasterResult =
  | { ok: true; dataUri: string; mediaType: RasterMediaType; bytes: number }
  | { ok: false; reason: string };

/**
 * Validate a raster data URI. Checks the declared type against the file's own
 * magic bytes, so a mislabelled file is refused rather than shipped as a logo
 * that renders as a broken-image icon on the customer's live site.
 *
 * image/svg+xml is deliberately NOT accepted here — an SVG has to go through
 * sanitizeSvg(), and letting one in through the raster door would be a way to
 * skip it.
 */
export function validateRasterDataUri(raw: unknown): RasterResult {
  if (typeof raw !== "string") return { ok: false, reason: "That wasn't an image we could read." };
  const uri = raw.trim();
  if (uri.length > LOGO_LIMITS.RASTER_DATA_URI_MAX) {
    return {
      ok: false,
      reason: `That logo is ${Math.round(uri.length / 1024)} KB encoded — the limit is ${
        LOGO_LIMITS.RASTER_DATA_URI_MAX / 1024
      } KB. Use an SVG, or a simpler image.`,
    };
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if (!match) {
    return { ok: false, reason: "Only PNG, JPEG and WebP logos are accepted (or an SVG file)." };
  }
  const mediaType = match[1] as RasterMediaType;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2], "base64");
  } catch {
    return { ok: false, reason: "That image didn't decode." };
  }
  if (bytes.length < 16) return { ok: false, reason: "That image is empty." };

  const sniffed = sniffImage(bytes);
  if (sniffed !== mediaType) {
    return { ok: false, reason: "That file's contents don't match its image type." };
  }
  return { ok: true, dataUri: uri, mediaType, bytes: bytes.length };
}

function sniffImage(b: Buffer): RasterMediaType | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parsing / serialising a stored kit
// ---------------------------------------------------------------------------

function cleanBusinessName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Newlines are stripped, not just trimmed: this string is interpolated into
  // the builder's prompt, and a multi-line "name" is how someone would try to
  // write their own instructions into it. Combined with the 80-char cap that
  // leaves very little room to say anything.
  const v = stripControls(raw.replace(/[\r\n\t]+/g, " ")).replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.slice(0, BUSINESS_NAME_MAX).trim();
}

export type ParsedPalette = { ok: true; palette: BrandPalette } | { ok: false; reason: string };

/** Accepts either `{ presetId }` or explicit hexes. Never adjectives. */
export function parsePalette(raw: unknown): ParsedPalette {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "A palette is required." };
  }
  const input = raw as Record<string, unknown>;

  if (typeof input.presetId === "string" && input.presetId) {
    const palette = paletteFromPreset(input.presetId);
    if (!palette) return { ok: false, reason: "That isn't a palette we have." };
    return { ok: true, palette };
  }

  const primary = normalizeHex(input.primary);
  if (!primary) return { ok: false, reason: "A primary colour is required, as a hex value." };
  const secondary = normalizeHex(input.secondary) ?? mix(primary, "#000000", 0.28);
  const accent = normalizeHex(input.accent) ?? complement(primary);
  const surface = normalizeHex(input.surface) ?? "#ffffff";
  const ink = normalizeHex(input.ink) ?? readableInk(surface);

  return { ok: true, palette: { presetId: null, primary, secondary, accent, ink, surface } };
}

export function serializeBrandKit(kit: BrandKit): string {
  return JSON.stringify(kit);
}

/** Tolerant read of a stored row. Returns null for anything malformed. */
export function parseStoredBrandKit(content: string): BrandKit | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const businessName = cleanBusinessName(o.businessName);
  const palette = parsePalette(o.palette);
  if (!businessName || !palette.ok) return null;

  let logo: BrandLogo | null = null;
  const rawLogo = o.logo;
  if (typeof rawLogo === "object" && rawLogo !== null) {
    const l = rawLogo as Record<string, unknown>;
    if (l.format === "svg" && typeof l.markup === "string") {
      logo = { format: "svg", markup: l.markup };
    } else if (
      l.format === "raster" &&
      typeof l.dataUri === "string" &&
      typeof l.mediaType === "string" &&
      (RASTER_MEDIA_TYPES as readonly string[]).includes(l.mediaType)
    ) {
      logo = {
        format: "raster",
        dataUri: l.dataUri,
        mediaType: l.mediaType as RasterMediaType,
        width: typeof l.width === "number" ? l.width : LOGO_LIMITS.RASTER_MAX_EDGE,
        height: typeof l.height === "number" ? l.height : LOGO_LIMITS.RASTER_MAX_EDGE,
      };
    }
  }

  return {
    version: 1,
    businessName,
    palette: palette.palette,
    logo,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date(0).toISOString(),
  };
}

/** Validate an inbound PUT body into a storable kit. Sanitises the logo. */
export type BuildKitResult =
  | { ok: true; kit: BrandKit; warnings: string[] }
  | { ok: false; reason: string };

export function buildBrandKit(body: unknown): BuildKitResult {
  if (typeof body !== "object" || body === null) return { ok: false, reason: "Invalid request." };
  const o = body as Record<string, unknown>;

  const businessName = cleanBusinessName(o.businessName);
  if (!businessName) return { ok: false, reason: "A business name is required." };

  const palette = parsePalette(o.palette);
  if (!palette.ok) return { ok: false, reason: palette.reason };

  let logo: BrandLogo | null = null;
  const warnings: string[] = [];

  if (o.logo !== null && o.logo !== undefined) {
    if (typeof o.logo !== "object") return { ok: false, reason: "Invalid logo." };
    const l = o.logo as Record<string, unknown>;
    if (l.format === "svg") {
      if (typeof l.source !== "string") return { ok: false, reason: "Invalid SVG." };
      const clean = sanitizeSvg(l.source);
      if (!clean.ok) return { ok: false, reason: clean.reason };
      logo = { format: "svg", markup: clean.svg };
      if (clean.removed.length > 0) {
        warnings.push(`Removed from your SVG: ${clean.removed.join(", ")}.`);
      }
    } else if (l.format === "raster") {
      const checked = validateRasterDataUri(l.dataUri);
      if (!checked.ok) return { ok: false, reason: checked.reason };
      const width = Math.round(Number(l.width) || 0);
      const height = Math.round(Number(l.height) || 0);
      if (
        width < 1 ||
        height < 1 ||
        width > LOGO_LIMITS.RASTER_MAX_EDGE ||
        height > LOGO_LIMITS.RASTER_MAX_EDGE
      ) {
        return {
          ok: false,
          reason: `A raster logo must be at most ${LOGO_LIMITS.RASTER_MAX_EDGE}px on its longest edge.`,
        };
      }
      logo = { format: "raster", dataUri: checked.dataUri, mediaType: checked.mediaType, width, height };
    } else {
      return { ok: false, reason: "Invalid logo." };
    }
  }

  return {
    ok: true,
    kit: {
      version: 1,
      businessName,
      palette: palette.palette,
      logo,
      updatedAt: new Date().toISOString(),
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// (a) The @theme block for src/index.css
// ---------------------------------------------------------------------------

export const THEME_START =
  "/* kodely:brand-start — generated from this project's brand kit. Edit it in the Brand panel, not here. */";
export const THEME_END = "/* kodely:brand-end */";

/**
 * Tailwind v4 reads `@theme` and emits both the CSS variables and the matching
 * utilities, so `--color-brand-600` becomes `bg-brand-600`, `text-brand-600`,
 * `border-brand-600` and the rest for free.
 *
 * This is why the palette is seeded as CSS rather than described in the prompt:
 * ~20 lines of CSS the builder can reference by utility name is a fraction of
 * the tokens it would take to explain a colour system in prose, and — unlike
 * prose — it cannot be paraphrased into something else.
 */
export function brandThemeBlock(kit: BrandKit): string {
  const { palette } = kit;
  const ramp = colorRamp(palette.primary);
  const onPrimary = readableInk(palette.primary);
  const onAccent = readableInk(palette.accent);

  const lines = [
    THEME_START,
    "@theme {",
    ...Object.entries(ramp).map(([step, hex]) => `  --color-brand-${step}: ${hex};`),
    `  --color-brand-contrast: ${onPrimary};`,
    `  --color-brand-secondary: ${palette.secondary};`,
    `  --color-accent: ${palette.accent};`,
    `  --color-accent-contrast: ${onAccent};`,
    `  --color-ink: ${palette.ink};`,
    `  --color-surface: ${palette.surface};`,
    `  --brand-gradient: ${brandGradientCss(palette)};`,
    "}",
    THEME_END,
  ];
  return lines.join("\n");
}

const THEME_BLOCK_RE = new RegExp(
  `${escapeRegExp(THEME_START)}[\\s\\S]*?${escapeRegExp(THEME_END)}\\n?`,
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splice the block into an existing stylesheet, replacing any previous one.
 *
 * Surgical rather than wholesale: src/index.css is a file the builder also
 * edits, and overwriting it would silently delete whatever custom CSS a
 * generation added. The markers are what make the operation repeatable.
 */
export function applyBrandTheme(css: string, kit: BrandKit): string {
  const block = brandThemeBlock(kit);
  if (THEME_BLOCK_RE.test(css)) return css.replace(THEME_BLOCK_RE, `${block}\n`);

  // @theme must come after the Tailwind import to be picked up.
  const importMatch = /^\s*@import\s+["']tailwindcss["'];?[^\n]*\n/m.exec(css);
  if (importMatch) {
    const at = importMatch.index + importMatch[0].length;
    return `${css.slice(0, at)}\n${block}\n${css.slice(at)}`;
  }
  return `${block}\n\n${css}`;
}

export function removeBrandTheme(css: string): string {
  return THEME_BLOCK_RE.test(css) ? css.replace(THEME_BLOCK_RE, "").replace(/\n{3,}/g, "\n\n") : css;
}

// ---------------------------------------------------------------------------
// The generated <BrandLogo /> component
// ---------------------------------------------------------------------------

/** `stroke-width` -> `strokeWidth`. Correct for every attribute on the allowlist. */
function toJsxAttr(name: string): string {
  return name.includes("-") ? name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) : name;
}

/** Sanitised SVG markup -> JSX. Safe because the input came out of our own writer. */
function svgToJsx(markup: string): string {
  return markup
    .replace(/<([a-zA-Z]+)((?:\s+[a-zA-Z-]+="[^"]*")*)(\s*\/?)>/g, (_, tag: string, attrs: string, close: string) => {
      const jsxAttrs = attrs.replace(/\s+([a-zA-Z-]+)="([^"]*)"/g, (_m, name: string, value: string) => {
        return ` ${toJsxAttr(name)}="${value}"`;
      });
      return `<${tag}${jsxAttrs}${close}>`;
    })
    // Braces in text content would open a JSX expression.
    .replace(/([>])([^<>]*)([<])/g, (_m, a: string, text: string, b: string) =>
      `${a}${text.replace(/[{}]/g, (c) => (c === "{" ? "&#123;" : "&#125;"))}${b}`,
    );
}

/**
 * The `src/components/brand/BrandLogo.tsx` the project gets.
 *
 * There is ALWAYS a component, even with no logo uploaded — it falls back to a
 * wordmark in the brand colours. That is not cosmetic: once a generation has
 * written `import { BrandLogo } from ...`, making the file conditional on the
 * logo turns "clear my logo" into a build break on the customer's site.
 */
export function brandLogoComponent(kit: BrandKit): string {
  const name = JSON.stringify(kit.businessName);
  const header = `// Generated by Kodely's brand kit — this is the customer's own logo.
// Do not redraw it, recolour it, or replace it with text. To change it, use the
// Brand panel; editing this file by hand will be overwritten on the next save.

type Props = { className?: string; title?: string };
`;

  if (kit.logo?.format === "svg") {
    const jsx = svgToJsx(kit.logo.markup).replace(
      /^<svg /,
      '<svg role="img" aria-label={title} className={className} ',
    );
    return `${header}
export function BrandLogo({ className = "h-8 w-auto", title = ${name} }: Props) {
  return (
    ${jsx}
  );
}
`;
  }

  if (kit.logo?.format === "raster") {
    const { dataUri, width, height } = kit.logo;
    return `${header}
const SRC =
  "${dataUri}";

export function BrandLogo({ className = "h-8 w-auto", title = ${name} }: Props) {
  return <img src={SRC} alt={title} width={${width}} height={${height}} className={className} />;
}
`;
  }

  // The colour is an inline hex rather than `text-brand-700` on purpose: this
  // same fallback is what a CLEARED brand kit leaves behind, and clearing the
  // kit also removes the @theme block that would define that utility. A literal
  // value renders correctly either way.
  const wordmark = colorRamp(kit.palette.primary)[700];
  return `${header}
// No logo file was supplied, so the lockup is a wordmark in the brand colour.
export function BrandLogo({ className = "text-lg font-semibold tracking-tight", title = ${name} }: Props) {
  return (
    <span className={className} style={{ color: "${wordmark}" }}>
      {title}
    </span>
  );
}
`;
}

// ---------------------------------------------------------------------------
// (b) The prompt fragment
// ---------------------------------------------------------------------------

/**
 * The instruction the builder is given.
 *
 * Every colour is an exact hex plus, where there is one, the catalogue preset
 * id — never an adjective. "Warm and modern" is precisely what produces the
 * generic template this feature exists to replace, and it is also unfalsifiable:
 * there is no way to check afterwards whether the model honoured it. A hex is
 * checkable, and it is the same hex the @theme block already put in the CSS, so
 * the prompt and the stylesheet cannot drift apart.
 *
 * Measured at ~1,420 characters / ~400 tokens for a preset palette with a logo
 * — about $0.0012 per turn. It rides along on every turn of the build, which is
 * why it is a fixed list of values and not an essay.
 */
export function brandPromptFragment(kit: BrandKit): string {
  const { palette, businessName } = kit;
  const onPrimary = readableInk(palette.primary);
  const primaryVsInk = contrastRatio(palette.primary, onPrimary).toFixed(1);
  const preset = palette.presetId
    ? `catalogue preset "${palette.presetId}"`
    : "custom, chosen by the customer";

  const logoLine =
    kit.logo === null
      ? `Logo: none supplied. ${BRAND_LOGO_COMPONENT_PATH} exports <BrandLogo /> as a wordmark — use it in the header and footer rather than typing the name again.`
      : `Logo: the customer's real logo is already compiled into ${BRAND_LOGO_COMPONENT_PATH}, which exports <BrandLogo className="h-8 w-auto" />. Import it and place it in the header and the footer. Never redraw it, recolour it, or substitute text for it.`;

  return [
    "## Brand kit — the customer's actual brand. Not a suggestion, and not a starting point.",
    `Business name: ${JSON.stringify(businessName)}. Use it verbatim in the header, the footer and <title>. Do not translate, abbreviate or restyle it.`,
    `Palette (${preset}) — these exact values are ALREADY seeded as CSS variables in ${BRAND_CSS_PATH}, inside the block marked \`kodely:brand\`. Use the Tailwind utilities, do not re-declare the colours:`,
    `- primary ${palette.primary} — full ramp \`brand-50\`..\`brand-950\` (\`bg-brand-500\`, \`text-brand-700\`, \`border-brand-200\`); ${palette.primary} itself is \`brand-500\`.`,
    `- secondary ${palette.secondary} — \`var(--color-brand-secondary)\`.`,
    `- accent ${palette.accent} — \`bg-accent\`, \`text-accent\`. This is the ONLY accent. Do not introduce another.`,
    `- page: text \`text-ink\` (${palette.ink}) on \`bg-surface\` (${palette.surface}).`,
    `- brand gradient: \`bg-[image:var(--brand-gradient)]\`.`,
    `Contrast: text sitting on ${palette.primary} must be ${onPrimary} — use \`text-brand-contrast\` (${primaryVsInk}:1). Do not put white text on the gradient or on mid-tone brand colours; check every pair you invent.`,
    logoLine,
    "Design freely with these colours — where they go, how much of each, what the layout is. What is fixed is WHICH colours, the name, and the logo.",
  ].join("\n");
}

/** Everything a caller needs to apply a kit to a project's draft source tree. */
export function brandSourceEdits(kit: BrandKit, currentCss: string): { path: string; content: string }[] {
  return [
    { path: BRAND_CSS_PATH, content: applyBrandTheme(currentCss, kit) },
    { path: BRAND_LOGO_COMPONENT_PATH, content: brandLogoComponent(kit) },
  ];
}

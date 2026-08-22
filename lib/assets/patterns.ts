/**
 * Generated and procedural assets — gradients, mesh backgrounds, grain
 * overlays, section dividers, repeating patterns and initials avatars.
 *
 * WHY THIS IS THE HIGHEST-VALUE CATEGORY HERE
 * Under the sandbox CSP (`default-src 'self'; img-src 'self' data:`) a
 * generated site has no photography and no illustration library. What it does
 * have, for free, is the browser's own drawing engine: CSS gradients cost
 * nothing to ship, an SVG divider is a few hundred bytes, and a repeating dot
 * grid is one `background-image` declaration. Everything in this module is
 * either pure CSS or SVG generated from arithmetic — no binary asset, no
 * network request, and nothing that can silently fail at serve time.
 *
 * The palette is deliberately curated rather than random: hues are picked in
 * pairs that hold their contrast in both light and dark contexts, and every
 * preset is named after what it looks like so the agent can pick by intent
 * ("sunset", "graphite") instead of by hex.
 */

export type GradientFamily = "warm" | "cool" | "vivid" | "nature" | "neutral" | "pastel" | "dark";

export type GradientPreset = {
  id: string;
  name: string;
  family: GradientFamily;
  keywords: string[];
  /** Two or three stops, hoist-to-fly along `angle`. */
  colors: string[];
  /** Degrees, CSS convention (180 = top to bottom). */
  angle: number;
  /** Ready for `background-image`. */
  css: string;
  /** Tailwind arbitrary-value utility (spaces encoded as underscores). */
  tailwind: string;
};

type GradientDef = [id: string, name: string, family: GradientFamily, colors: string[], angle: number, keywords: string];

const GRADIENT_DEFS: GradientDef[] = [
  // warm
  ["sunset", "Sunset", "warm", ["#FFB347", "#FF6B6B"], 135, "hero warm orange coral evening summer"],
  ["ember", "Ember", "warm", ["#F97316", "#DC2626"], 140, "fire hot bold energetic food restaurant"],
  ["peach", "Peach", "warm", ["#FFD3A5", "#FD6585"], 120, "soft warm feminine beauty salon spa"],
  ["amber-glow", "Amber glow", "warm", ["#FDE68A", "#F59E0B"], 160, "gold honey bakery warm cta"],
  ["terracotta", "Terracotta", "warm", ["#E2725B", "#8C4A3F"], 150, "earthy clay pottery artisan rustic mediterranean"],
  ["gold-leaf", "Gold leaf", "warm", ["#F6E27A", "#C8A24A"], 135, "luxury premium jewellery elegant gilded"],
  // cool
  ["ocean", "Ocean", "cool", ["#0EA5E9", "#2563EB"], 135, "blue sea corporate tech trust saas"],
  ["deep-sea", "Deep sea", "cool", ["#1E3A8A", "#0F172A"], 160, "dark blue navy serious finance night"],
  ["lagoon", "Lagoon", "cool", ["#06B6D4", "#3B82F6"], 130, "aqua tropical travel fresh clean"],
  ["mint", "Mint", "cool", ["#A7F3D0", "#34D399"], 140, "fresh green health clinic wellness clean"],
  ["teal-fade", "Teal fade", "cool", ["#14B8A6", "#0E7490"], 150, "teal calm professional medical dental"],
  ["arctic", "Arctic", "cool", ["#E0F2FE", "#7DD3FC"], 170, "light airy pale sky subtle background"],
  // vivid
  ["iris", "Iris", "vivid", ["#6366F1", "#A855F7"], 135, "purple violet creative saas startup ai"],
  ["magenta", "Magenta", "vivid", ["#D946EF", "#F43F5E"], 140, "pink bold nightlife fashion event"],
  ["neon", "Neon", "vivid", ["#22D3EE", "#A78BFA"], 125, "electric cyber gaming club bright"],
  ["citrus", "Citrus", "vivid", ["#A3E635", "#FACC15"], 130, "lime yellow juice fresh energetic sport"],
  ["candy", "Candy", "vivid", ["#F472B6", "#818CF8"], 135, "playful fun kids sweet bakery party"],
  ["aurora", "Aurora", "vivid", ["#6EE7B7", "#3B82F6", "#A78BFA"], 120, "three colour multi rainbow hero gradient tech"],
  // nature
  ["forest", "Forest", "nature", ["#4ADE80", "#166534"], 155, "green garden landscaping eco organic outdoors"],
  ["moss", "Moss", "nature", ["#84CC16", "#3F6212"], 150, "olive natural farm produce sustainable"],
  ["stone", "Stone", "nature", ["#D6D3D1", "#A8A29E"], 160, "grey neutral architecture minimal concrete"],
  // neutral
  ["graphite", "Graphite", "neutral", ["#374151", "#111827"], 160, "dark grey footer professional serious"],
  ["slate-mist", "Slate mist", "neutral", ["#F8FAFC", "#CBD5E1"], 170, "light subtle section background off white"],
  ["paper", "Paper", "neutral", ["#FFFBF5", "#F0E9E0"], 170, "cream warm white editorial print stationery"],
  ["ink", "Ink", "neutral", ["#1F2937", "#0B1120"], 165, "near black dark mode hero footer"],
  // pastel
  ["blush", "Blush", "pastel", ["#FFE4E6", "#FBCFE8"], 150, "soft pink wedding beauty gentle romantic"],
  ["lavender", "Lavender", "pastel", ["#EDE9FE", "#C7D2FE"], 150, "soft purple calm wellness spa gentle"],
  ["butter", "Butter", "pastel", ["#FEF9C3", "#FDE68A"], 155, "soft yellow cheerful cafe bakery light"],
  // dark
  ["midnight", "Midnight", "dark", ["#020617", "#1E293B"], 160, "black night dark mode luxury bar"],
  ["plum-night", "Plum night", "dark", ["#2E1065", "#0F172A"], 145, "dark purple moody nightclub premium"],
];

function linearGradientCss(colors: string[], angle: number): string {
  const stops = colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`);
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export const GRADIENTS: GradientPreset[] = GRADIENT_DEFS.map(([id, name, family, colors, angle, keywords]) => {
  const css = linearGradientCss(colors, angle);
  return {
    id,
    name,
    family,
    colors,
    angle,
    keywords: Array.from(new Set([...id.split("-"), ...keywords.split(" "), family, "gradient"])),
    css,
    tailwind: `bg-[${css.replace(/,\s+/g, ",").replace(/\s/g, "_")}]`,
  };
});

const GRADIENT_BY_ID = new Map(GRADIENTS.map((g) => [g.id, g]));

export function getGradient(id: string): GradientPreset | undefined {
  return GRADIENT_BY_ID.get(id);
}

/** Same palette, radial instead of linear — handy for spotlight/hero glows. */
export function radialGradientCss(id: string, at = "50% 0%"): string | null {
  const g = GRADIENT_BY_ID.get(id);
  if (!g) return null;
  const stops = g.colors.map((c, i) => `${c} ${Math.round((i / (g.colors.length - 1)) * 100)}%`);
  return `radial-gradient(120% 80% at ${at}, ${stops.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Mesh backgrounds — several offset radial gradients over a base colour. Pure
// CSS, so they scale to any viewport and cost nothing.
// ---------------------------------------------------------------------------

export type MeshPreset = {
  id: string;
  name: string;
  keywords: string[];
  /** Put on `background-color`. */
  base: string;
  /** Put on `background-image`. */
  css: string;
};

type MeshBlob = [x: string, y: string, size: string, color: string];

function meshCss(blobs: MeshBlob[]): string {
  return blobs.map(([x, y, size, color]) => `radial-gradient(${size} at ${x} ${y}, ${color} 0%, transparent 70%)`).join(", ");
}

type MeshDef = [id: string, name: string, base: string, blobs: MeshBlob[], keywords: string];

const MESH_DEFS: MeshDef[] = [
  [
    "aurora-mesh",
    "Aurora mesh",
    "#0B1120",
    [
      ["12%", "18%", "60% 55%", "rgba(99,102,241,.55)"],
      ["82%", "12%", "55% 50%", "rgba(34,211,238,.45)"],
      ["68%", "82%", "60% 60%", "rgba(168,85,247,.40)"],
      ["18%", "88%", "50% 45%", "rgba(16,185,129,.30)"],
    ],
    "dark hero saas tech glow nebula ai",
  ],
  [
    "sunrise-mesh",
    "Sunrise mesh",
    "#FFF7ED",
    [
      ["10%", "10%", "60% 55%", "rgba(253,186,116,.75)"],
      ["85%", "20%", "50% 50%", "rgba(251,113,133,.55)"],
      ["50%", "95%", "70% 55%", "rgba(253,224,71,.60)"],
    ],
    "light warm morning hero soft cafe",
  ],
  [
    "sea-mesh",
    "Sea mesh",
    "#ECFEFF",
    [
      ["15%", "20%", "55% 55%", "rgba(56,189,248,.55)"],
      ["80%", "35%", "55% 50%", "rgba(45,212,191,.50)"],
      ["45%", "95%", "65% 50%", "rgba(129,140,248,.35)"],
    ],
    "light blue calm travel clinic fresh",
  ],
  [
    "blush-mesh",
    "Blush mesh",
    "#FFF1F2",
    [
      ["20%", "15%", "55% 50%", "rgba(244,114,182,.50)"],
      ["85%", "45%", "50% 55%", "rgba(196,181,253,.50)"],
      ["35%", "90%", "60% 50%", "rgba(253,186,116,.35)"],
    ],
    "soft pink beauty salon wedding gentle",
  ],
  [
    "forest-mesh",
    "Forest mesh",
    "#F0FDF4",
    [
      ["18%", "22%", "55% 55%", "rgba(74,222,128,.55)"],
      ["82%", "18%", "50% 50%", "rgba(163,230,53,.45)"],
      ["55%", "92%", "65% 50%", "rgba(20,184,166,.35)"],
    ],
    "green organic garden eco natural",
  ],
  [
    "graphite-mesh",
    "Graphite mesh",
    "#111827",
    [
      ["25%", "15%", "60% 55%", "rgba(148,163,184,.28)"],
      ["80%", "70%", "55% 55%", "rgba(71,85,105,.45)"],
    ],
    "dark subtle neutral footer professional",
  ],
];

export const MESHES: MeshPreset[] = MESH_DEFS.map(([id, name, base, blobs, keywords]) => ({
  id,
  name,
  base,
  css: meshCss(blobs),
  keywords: Array.from(new Set([...id.split("-"), ...keywords.split(" "), "mesh", "background", "blob"])),
}));

// ---------------------------------------------------------------------------
// Grain / noise overlays. feTurbulence rendered into a data: URI — allowed by
// `img-src 'self' data:`, and a couple of hundred bytes rather than a PNG.
// ---------------------------------------------------------------------------

/**
 * A tiling monochrome grain texture as a `data:` URI.
 *
 * @param opacity  0-1, how visible the grain is. 0.04-0.10 is the useful band.
 * @param frequency  Higher = finer grain. 0.65-0.9 reads as film grain.
 */
export function noiseDataUri(opacity = 0.06, frequency = 0.8): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="120" height="120" filter="url(#n)" opacity="${opacity}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

export type TexturePreset = { id: string; name: string; keywords: string[]; css: string; note: string };

export const TEXTURES: TexturePreset[] = [
  {
    id: "grain-fine",
    name: "Fine grain",
    keywords: ["noise", "grain", "texture", "film", "overlay", "subtle", "paper"],
    css: `background-image: url("${noiseDataUri(0.05, 0.9)}"); background-repeat: repeat;`,
    note: "Layer over a gradient with a positioned pseudo-element and pointer-events:none.",
  },
  {
    id: "grain-coarse",
    name: "Coarse grain",
    keywords: ["noise", "grain", "texture", "rough", "gritty", "print", "overlay"],
    css: `background-image: url("${noiseDataUri(0.09, 0.6)}"); background-repeat: repeat;`,
    note: "Heavier — pairs well with dark hero sections.",
  },
  {
    id: "grain-paper",
    name: "Paper grain",
    keywords: ["noise", "paper", "editorial", "print", "stationery", "warm", "texture"],
    css: `background-color: #FFFBF5; background-image: url("${noiseDataUri(0.045, 0.75)}");`,
    note: "A complete off-white paper surface, background colour included.",
  },
];

// ---------------------------------------------------------------------------
// Section dividers. Drawn on a 1440x120 canvas and stretched with
// preserveAspectRatio="none", which is what makes one path work at any width.
// ---------------------------------------------------------------------------

export type DividerPreset = { id: string; name: string; keywords: string[]; d: string };

export const DIVIDER_VIEWBOX = "0 0 1440 120";

export const DIVIDERS: DividerPreset[] = [
  {
    id: "wave",
    name: "Wave",
    keywords: ["wave", "curve", "water", "smooth", "section", "divider", "separator"],
    d: "M0 48c180 44 360 44 540 12s360-56 540-12 240 44 360 12v60H0z",
  },
  {
    id: "wave-soft",
    name: "Soft wave",
    keywords: ["wave", "gentle", "subtle", "curve", "section", "divider"],
    d: "M0 72c240 32 480 32 720 0s480-32 720 0v48H0z",
  },
  {
    id: "curve",
    name: "Curve",
    keywords: ["curve", "arc", "round", "dome", "section", "divider"],
    d: "M0 120C360 24 1080 24 1440 120z",
  },
  {
    id: "curve-inverse",
    name: "Inverted curve",
    keywords: ["curve", "arc", "concave", "scoop", "section", "divider"],
    d: "M0 0c360 96 1080 96 1440 0v120H0z",
  },
  {
    id: "angle",
    name: "Angle",
    keywords: ["angle", "slant", "diagonal", "slope", "section", "divider", "modern"],
    d: "M0 120 1440 0v120z",
  },
  {
    id: "angle-reverse",
    name: "Reverse angle",
    keywords: ["angle", "slant", "diagonal", "slope", "section", "divider"],
    d: "M0 0 1440 120H0z",
  },
  {
    id: "tilt",
    name: "Tilt",
    keywords: ["tilt", "shallow", "slant", "diagonal", "subtle", "divider"],
    d: "M0 96 1440 24v96H0z",
  },
  {
    id: "triangle",
    name: "Triangle",
    keywords: ["triangle", "point", "arrow", "notch", "divider", "peak"],
    d: "M0 0h1440v120L720 24 0 120z",
  },
  {
    id: "arrow",
    name: "Arrow",
    keywords: ["arrow", "chevron", "point", "down", "divider", "scroll"],
    d: "M0 0h620l100 72L820 0h620v120H0z",
  },
  {
    id: "book",
    name: "Book fold",
    keywords: ["book", "fold", "split", "double", "curve", "divider"],
    d: "M0 120c240-72 480-72 720 0 240-72 480-72 720 0z",
  },
  {
    id: "zigzag",
    name: "Zigzag",
    keywords: ["zigzag", "jagged", "saw", "playful", "divider", "torn"],
    d: "M0 120V60l144 36 144-36 144 36 144-36 144 36 144-36 144 36 144-36 144 36 144-36v60z",
  },
  {
    id: "steps",
    name: "Steps",
    keywords: ["steps", "blocks", "stair", "geometric", "divider", "brutalist"],
    d: "M0 120V96h288V72h288V48h288V24h288V0h288v120z",
  },
];

export type DividerRenderOptions = {
  /** Fill of the divider shape — normally the colour of the *next* section. */
  fill?: string;
  /** Rendered height in px (the shape stretches to the container's width). */
  height?: number;
  flipX?: boolean;
  flipY?: boolean;
  className?: string;
};

/**
 * A full-bleed `<svg>` divider. Drop it at the very bottom of a section with
 * the *following* section's background colour as `fill`.
 */
export function dividerSvg(id: string, opts: DividerRenderOptions = {}): string | null {
  const preset = DIVIDERS.find((d) => d.id === id);
  if (!preset) return null;
  const { fill = "currentColor", height = 90, flipX = false, flipY = false, className } = opts;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  const tx = flipX ? 1440 : 0;
  const ty = flipY ? 120 : 0;
  const transform = flipX || flipY ? ` transform="translate(${tx} ${ty}) scale(${sx} ${sy})"` : "";
  // `block w-full` rather than an inline style: a style attribute is a string
  // in HTML but must be an object in JSX, so it would break the moment the
  // markup is pasted into a .tsx file. `display:block` matters here — an
  // inline svg otherwise sits on the text baseline and leaves a gap under the
  // divider.
  const cls = `${className ? className + " " : ""}block w-full`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${DIVIDER_VIEWBOX}" preserveAspectRatio="none"` +
    ` width="100%" height="${height}" aria-hidden="true" class="${cls}">` +
    `<path d="${preset.d}" fill="${fill}"${transform}/></svg>`
  );
}

// ---------------------------------------------------------------------------
// Repeating patterns. All pure CSS — no image, no data URI, no bytes.
// ---------------------------------------------------------------------------

export type PatternPreset = {
  id: string;
  name: string;
  keywords: string[];
  /** Complete declarations, ready to paste into a class or a style attribute. */
  css: string;
  /** Regenerate with a different colour/scale. */
  build: (color: string, size: number) => string;
};

type PatternDef = [id: string, name: string, keywords: string, defaultSize: number, build: (c: string, s: number) => string];

const PATTERN_DEFS: PatternDef[] = [
  [
    "dots",
    "Dot grid",
    "dots polka spots texture background subtle grid",
    22,
    (c, s) => `background-image: radial-gradient(${c} 1.5px, transparent 1.5px); background-size: ${s}px ${s}px;`,
  ],
  [
    "dots-dense",
    "Dense dots",
    "dots fine stipple halftone texture background",
    10,
    (c, s) => `background-image: radial-gradient(${c} 1px, transparent 1px); background-size: ${s}px ${s}px;`,
  ],
  [
    "grid",
    "Grid",
    "grid lines graph blueprint squared background technical",
    24,
    (c, s) =>
      `background-image: linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px);` +
      ` background-size: ${s}px ${s}px;`,
  ],
  [
    "grid-large",
    "Large grid",
    "grid lines architectural plan squared background spacious",
    64,
    (c, s) =>
      `background-image: linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px);` +
      ` background-size: ${s}px ${s}px;`,
  ],
  [
    "lines-horizontal",
    "Horizontal rules",
    "lines stripes rules ruled notebook horizontal background",
    12,
    (c, s) => `background-image: repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px ${s}px);`,
  ],
  [
    "stripes",
    "Diagonal stripes",
    "stripes diagonal barber awning candy hazard pattern",
    16,
    (c, s) => `background-image: repeating-linear-gradient(45deg, ${c} 0 ${s / 2}px, transparent ${s / 2}px ${s}px);`,
  ],
  [
    "stripes-wide",
    "Wide stripes",
    "stripes bold awning cabana deckchair diagonal",
    40,
    (c, s) => `background-image: repeating-linear-gradient(45deg, ${c} 0 ${s / 2}px, transparent ${s / 2}px ${s}px);`,
  ],
  [
    "crosshatch",
    "Crosshatch",
    "hatch weave texture crossed diagonal fabric",
    14,
    (c, s) =>
      `background-image: repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px ${s}px),` +
      ` repeating-linear-gradient(-45deg, ${c} 0 1px, transparent 1px ${s}px);`,
  ],
  [
    "checkerboard",
    "Checkerboard",
    "checker chequered squares tiles retro racing pattern",
    28,
    (c, s) =>
      `background-image: conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0);` +
      ` background-size: ${s}px ${s}px;`,
  ],
  [
    // Deliberately NOT a masked plus/cross grid: `mask-image` on a section
    // clips the section's own text along with the pattern. A half-drop dot
    // field gets the same "sparse geometric" feel from backgrounds alone.
    "dots-offset",
    "Offset dots",
    "dots halftone sparse geometric diamond half drop staggered background",
    28,
    (c, s) =>
      `background-image: radial-gradient(${c} 1.5px, transparent 1.5px), radial-gradient(${c} 1.5px, transparent 1.5px);` +
      ` background-size: ${s}px ${s}px; background-position: 0 0, ${s / 2}px ${s / 2}px;`,
  ],
  [
    "vignette",
    "Vignette",
    "vignette fade edges spotlight focus overlay",
    0,
    (c) => `background-image: radial-gradient(120% 90% at 50% 40%, transparent 40%, ${c} 100%);`,
  ],
  [
    "fade-bottom",
    "Bottom fade",
    "fade scrim overlay gradient legibility text over image",
    0,
    (c) => `background-image: linear-gradient(to bottom, transparent 0%, ${c} 100%);`,
  ],
];

const DEFAULT_PATTERN_COLOR = "rgba(0,0,0,.08)";

export const PATTERNS: PatternPreset[] = PATTERN_DEFS.map(([id, name, keywords, size, build]) => ({
  id,
  name,
  keywords: Array.from(new Set([...id.split("-"), ...keywords.split(" "), "pattern", "background"])),
  css: build(DEFAULT_PATTERN_COLOR, size),
  build: (color = DEFAULT_PATTERN_COLOR, s = size) => build(color, s),
}));

export function getPattern(id: string): PatternPreset | undefined {
  return PATTERNS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Initials avatars. Deterministic from a name, so the same person gets the
// same colour on every page and across rebuilds.
// ---------------------------------------------------------------------------

/** FNV-1a. Small, stable, and good enough to spread names across a hue wheel. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Up to two initials: "Ada Lovelace" -> "AL", "cheryl" -> "C". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export type AvatarColors = { from: string; to: string; text: string };

/**
 * A deterministic two-stop colour pair for a name. Saturation and lightness
 * are fixed so every avatar in a list has the same weight — only the hue moves.
 */
export function avatarColors(name: string): AvatarColors {
  const h = hash(name.toLowerCase());
  const hue = h % 360;
  // Skip the 55-90deg band, where mid-lightness yellows go muddy against white text.
  const safeHue = hue > 55 && hue < 90 ? hue + 40 : hue;
  return {
    from: `hsl(${safeHue} 62% 52%)`,
    to: `hsl(${(safeHue + 28) % 360} 58% 40%)`,
    text: "#ffffff",
  };
}

export type AvatarOptions = {
  size?: number;
  /** "circle" (default) or "rounded". */
  shape?: "circle" | "rounded";
  className?: string;
};

/** An inline `<svg>` initials avatar — no image, no request, no layout shift. */
export function initialsAvatarSvg(name: string, opts: AvatarOptions = {}): string {
  const { size = 64, shape = "circle", className } = opts;
  const { from, to, text } = avatarColors(name);
  const initials = initialsOf(name);
  // The gradient id must be unique per name so two avatars on one page don't
  // collide — SVG gradient ids are document-global.
  const gid = `av${hash(name).toString(36)}`;
  const bg =
    shape === "circle"
      ? `<circle cx="32" cy="32" r="32" fill="url(#${gid})"/>`
      : `<rect width="64" height="64" rx="16" fill="url(#${gid})"/>`;
  const cls = className ? ` class="${className}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"` +
    ` role="img" aria-label="${name.replace(/[<>&"]/g, "")}"${cls}>` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>` +
    bg +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="${text}"` +
    ` font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="${
      initials.length > 1 ? 26 : 30
    }" font-weight="600" letter-spacing="0.5">${initials}</text></svg>`
  );
}

/**
 * The CSS-only form: a gradient background plus the initials as text. Cheaper
 * than the SVG when the avatar is already a React element.
 */
export function initialsAvatarCss(name: string): { css: string; initials: string } {
  const { from, to, text } = avatarColors(name);
  return {
    initials: initialsOf(name),
    css: `background-image: linear-gradient(135deg, ${from}, ${to}); color: ${text};`,
  };
}

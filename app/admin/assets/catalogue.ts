import { readdir, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import type { CSSProperties } from "react";
import {
  ASSET_KINDS,
  FLAGS,
  GRADIENTS,
  ICONS,
  MESHES,
  PATTERNS,
  TEXTURES,
  backdropSvg,
  dividerSvg,
  emptyStateSvg,
  flagSvg,
  iconSvg,
  initialsAvatarSvg,
  listAssets,
  markSvg,
  spotSvg,
  type AssetKind,
  type AssetMatch,
} from "@/lib/assets";
import type { IconWeight } from "@/lib/assets/icons";
import { provenanceForKind, type SourceProvenance } from "@/lib/assets/provenance";

// The data layer behind /admin/assets.
//
// ── WHY THE PAGE READS THE CATALOGUE THROUGH listAssets() ──────────────────
// listAssets() is the same function lib/assets/materialize.ts writes to disk
// for the SDK engine and the same one app/api/assets backs `find_assets` with.
// Building rows from it — rather than from ICONS/FLAGS/GRADIENTS directly —
// means the id, the format and above all the BYTE SIZE on this page are
// measured on the exact string the build agent is handed, not on some other
// rendering of the same asset. If the two ever diverge, the page is wrong in
// the direction of showing the agent's reality, which is the useful direction.
//
// The previews are the one thing built separately (see buildPreview): the
// agent's `source` for an icon is JSX, and JSX attribute casing
// (`strokeWidth`) is silently dropped by an HTML parser, so a preview rendered
// from it would be subtly wrong. Previews therefore call the underlying
// renderers for raw, HTML-correct SVG.

/** How an asset is delivered. This is the catalogue's only real "style" axis. */
export type AssetFormat = AssetMatch["format"];

export type Preview =
  | { type: "svg"; markup: string; shape: PreviewShape }
  | { type: "css"; style: CSSProperties }
  | { type: "text"; text: string };

/** Preview box geometry. Wide things (dividers, backdrops, marks) need a strip. */
export type PreviewShape = "square" | "wide";

export type AssetRow = {
  /** Namespaced id — the string the build agent references, e.g. "icon:phone". */
  id: string;
  kind: AssetKind;
  name: string;
  keywords: string[];
  /**
   * The catalogue's own sub-grouping within a kind, namespaced by kind because
   * the sub-groupings collide otherwise: "nature" is both an icon category and
   * a gradient family, and an un-namespaced filter would silently mix them.
   */
  category: string | null;
  categoryLabel: string | null;
  format: AssetFormat;
  /** UTF-8 length of the exact `source` the agent receives. */
  bytes: number;
  preview: Preview;
  provenance: SourceProvenance;
  /** Provenance caveats that attach to THIS asset, beyond its module's. */
  assetCaveats: string[];
  /** Lowercased name + id + keywords, for the substring filter. */
  haystack: string;
};

export type Facet = { value: string; label: string; count: number };

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const KIND_LABELS: Record<AssetKind, string> = {
  icon: "Icon",
  flag: "Flag",
  gradient: "Gradient",
  mesh: "Mesh background",
  texture: "Texture",
  divider: "Section divider",
  pattern: "Repeating pattern",
  avatar: "Avatar",
  backdrop: "Hero backdrop",
  illustration: "Spot illustration",
  mark: "Decorative mark",
  "empty-state": "Empty-state art",
};

export const FORMAT_LABELS: Record<AssetFormat, string> = {
  jsx: "Inline SVG (JSX)",
  svg: "Raw SVG",
  css: "CSS declarations",
  text: "Emoji text",
};

export const ICON_WEIGHTS_ORDER: Record<IconWeight, string> = {
  light: "Light (1.25)",
  regular: "Regular (1.75)",
  bold: "Bold (2.25)",
};

// ---------------------------------------------------------------------------
// Per-asset facts the AssetMatch does not carry
// ---------------------------------------------------------------------------

const ICON_CATEGORY = new Map(ICONS.map((i) => [i.id, i.category]));
const FLAG_BY_CODE = new Map(FLAGS.map((f) => [f.code, f]));
const GRADIENT_FAMILY = new Map(GRADIENTS.map((g) => [g.id, g.family]));
const MESH_BY_ID = new Map(MESHES.map((m) => [m.id, m]));
const TEXTURE_BY_ID = new Map(TEXTURES.map((t) => [t.id, t]));
const PATTERN_BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

/** "icon:phone" -> "phone". Ids are namespaced on the first colon only. */
function bareId(id: string): string {
  return id.slice(id.indexOf(":") + 1);
}

const UTF8 = new TextEncoder();

function byteLength(s: string): number {
  return UTF8.encode(s).length;
}

// ---------------------------------------------------------------------------
// CSS previews
// ---------------------------------------------------------------------------

/**
 * The five background properties patterns.ts actually emits, and nothing else.
 *
 * A general CSS parser would be the wrong tool: React needs a CSSProperties
 * object, the preview is decoration, and an unrecognised declaration must not
 * be able to throw on an admin page. Anything outside this map is dropped —
 * the preview degrades, the row still renders, and the `source` column still
 * shows the real declaration.
 */
const CSS_PROPS: Record<string, keyof CSSProperties> = {
  "background-color": "backgroundColor",
  "background-image": "backgroundImage",
  "background-size": "backgroundSize",
  "background-position": "backgroundPosition",
  "background-repeat": "backgroundRepeat",
};

function declarationsToStyle(css: string): CSSProperties {
  const style: Record<string, string> = {};
  // Split on ";" only outside parentheses: a mesh is several radial-gradient()
  // calls and their colour stops contain no semicolons, but splitting naively
  // on ";" would still be fragile the day one does. Depth counting is three
  // lines and removes the class of bug entirely.
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) {
      parts.push(css.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(css.slice(start));

  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (!value) continue;
    // hasOwnProperty, never `in`: CSS_PROPS is a plain object literal, so
    // `"constructor" in CSS_PROPS` is true and would put a Function into the
    // style object. Same guard, same reason, as every query-param guard here.
    if (!Object.prototype.hasOwnProperty.call(CSS_PROPS, prop)) continue;
    style[CSS_PROPS[prop]] = value;
  }
  return style as CSSProperties;
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

// Preview sizes are small on purpose: the icons tab renders a page of rows and
// every one of these strings is inlined into the HTML.
function buildPreview(match: AssetMatch, weight: IconWeight): Preview {
  const id = bareId(match.id);

  switch (match.kind) {
    case "icon": {
      const markup = iconSvg(id, { weight, size: 26 });
      return markup ? { type: "svg", markup, shape: "square" } : { type: "text", text: "—" };
    }
    case "flag": {
      const markup = flagSvg(id, { width: 38 });
      if (markup) return { type: "svg", markup, shape: "square" };
      // Emoji-only country. Rendered as the emoji it actually is — including
      // the fact that it will show as two letter boxes on Windows, which is
      // the caveat flags.ts warns about and the operator should see for real.
      return { type: "text", text: FLAG_BY_CODE.get(id)?.emoji ?? "?" };
    }
    case "gradient": {
      const g = GRADIENTS.find((x) => x.id === id);
      return { type: "css", style: g ? { backgroundImage: g.css } : {} };
    }
    case "mesh": {
      const m = MESH_BY_ID.get(id);
      return { type: "css", style: m ? { backgroundColor: m.base, backgroundImage: m.css } : {} };
    }
    case "texture": {
      const t = TEXTURE_BY_ID.get(id);
      return { type: "css", style: t ? declarationsToStyle(t.css) : {} };
    }
    case "pattern": {
      const p = PATTERN_BY_ID.get(id);
      return { type: "css", style: p ? declarationsToStyle(p.css) : {} };
    }
    case "divider": {
      const markup = dividerSvg(id, { fill: "currentColor", height: 26 });
      return markup ? { type: "svg", markup, shape: "wide" } : { type: "text", text: "—" };
    }
    case "avatar":
      return { type: "svg", markup: initialsAvatarSvg("Ada Lovelace", { size: 30 }), shape: "square" };
    case "backdrop": {
      const markup = backdropSvg(id);
      return markup ? { type: "svg", markup, shape: "wide" } : { type: "text", text: "—" };
    }
    case "illustration": {
      const markup = spotSvg(id, { size: 34 });
      return markup ? { type: "svg", markup, shape: "square" } : { type: "text", text: "—" };
    }
    case "mark": {
      const markup = markSvg(id, { width: 60 });
      return markup ? { type: "svg", markup, shape: "wide" } : { type: "text", text: "—" };
    }
    case "empty-state": {
      const markup = emptyStateSvg(id, { size: 40 });
      return markup ? { type: "svg", markup, shape: "square" } : { type: "text", text: "—" };
    }
  }
}

// ---------------------------------------------------------------------------
// Category (the catalogue's own sub-grouping, per kind)
// ---------------------------------------------------------------------------

function categoryOf(match: AssetMatch): { value: string; label: string } | null {
  const id = bareId(match.id);
  if (match.kind === "icon") {
    const c = ICON_CATEGORY.get(id);
    return c ? { value: `icon:${c}`, label: `Icons · ${c}` } : null;
  }
  if (match.kind === "gradient") {
    const f = GRADIENT_FAMILY.get(id);
    return f ? { value: `gradient:${f}`, label: `Gradients · ${f}` } : null;
  }
  if (match.kind === "flag") {
    const flag = FLAG_BY_CODE.get(id);
    if (!flag) return null;
    if (!flag.svg) return { value: "flag:emoji", label: "Flags · emoji only" };
    return flag.svg.accuracy === "simplified"
      ? { value: "flag:simplified", label: "Flags · SVG (simplified)" }
      : { value: "flag:exact", label: "Flags · SVG (exact)" };
  }
  return null;
}

/**
 * Caveats that belong to one asset rather than to its whole module.
 *
 * Only two exist today, and both come from data the catalogue already holds —
 * an icon's category and a flag's `accuracy`. Everything else a lawyer would
 * want is not recorded anywhere; see PROVENANCE_GAP.
 */
function caveatsFor(match: AssetMatch): string[] {
  const id = bareId(match.id);
  if (match.kind === "icon" && ICON_CATEGORY.get(id) === "social") {
    return ["Brand mark — simplified and generic, but a trademark question. Check the platform's brand guidelines before a commercial site uses it."];
  }
  if (match.kind === "flag") {
    const flag = FLAG_BY_CODE.get(id);
    if (flag?.svg?.accuracy === "simplified") {
      return [`Simplified drawing — ${flag.svg.note ?? "detail omitted"}.`];
    }
    if (flag && !flag.svg) {
      return ["Emoji, not a drawing. Windows Chrome/Edge render it as two grey letter boxes."];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Every asset in the catalogue, as rows.
 *
 * `weight` is a render option, not a filter: icons are one geometry at three
 * stroke widths, so changing it changes the preview AND the byte count of the
 * source the agent gets — which is the honest way to show a knob that has no
 * effect on what exists.
 */
export function buildRows(weight: IconWeight): AssetRow[] {
  return listAssets(undefined, { weight }).map((match) => {
    const category = categoryOf(match);
    return {
      id: match.id,
      kind: match.kind,
      name: match.name,
      keywords: match.keywords,
      category: category?.value ?? null,
      categoryLabel: category?.label ?? null,
      format: match.format,
      bytes: byteLength(match.source),
      preview: buildPreview(match, weight),
      provenance: provenanceForKind(match.kind),
      assetCaveats: caveatsFor(match),
      haystack: `${match.name} ${match.id} ${match.keywords.join(" ")}`.toLowerCase(),
    };
  });
}

export function kindFacets(rows: AssetRow[]): Facet[] {
  // ASSET_KINDS order, not insertion order: it is the catalogue's own
  // declaration order and matches how lib/assets/index.ts lists things.
  return ASSET_KINDS.map((kind) => ({
    value: kind,
    label: KIND_LABELS[kind],
    count: rows.filter((r) => r.kind === kind).length,
  })).filter((f) => f.count > 0);
}

/**
 * Facets are counted over the WHOLE catalogue, not over the current view.
 * A count that moved as you narrowed the filters would answer "how many are
 * left", when the question a filter dropdown is asked is "how many exist".
 */
export function categoryFacets(rows: AssetRow[]): Facet[] {
  const counts = new Map<string, Facet>();
  for (const r of rows) {
    if (!r.category || !r.categoryLabel) continue;
    const existing = counts.get(r.category);
    if (existing) existing.count++;
    else counts.set(r.category, { value: r.category, label: r.categoryLabel, count: 1 });
  }
  return [...counts.values()];
}

export function formatFacets(rows: AssetRow[]): Facet[] {
  const counts = new Map<AssetFormat, number>();
  for (const r of rows) counts.set(r.format, (counts.get(r.format) ?? 0) + 1);
  // Built from what is present rather than from the AssetMatch["format"] union:
  // nothing in the catalogue emits "svg" today, and offering a filter that can
  // only ever return nothing is a way of implying an asset exists.
  return [...counts.entries()].map(([value, count]) => ({
    value,
    label: FORMAT_LABELS[value],
    count,
  }));
}

export type RowFilter = {
  q: string;
  kind: string;
  category: string;
  format: string;
};

export function filterRows(rows: AssetRow[], f: RowFilter): AssetRow[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.kind && r.kind !== f.kind) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.format && r.format !== f.format) return false;
    if (needle && !r.haystack.includes(needle)) return false;
    return true;
  });
}

export function totalBytes(rows: AssetRow[]): number {
  return rows.reduce((sum, r) => sum + r.bytes, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// What raster media actually exists in this repository
// ---------------------------------------------------------------------------
//
// The Images and Videos tabs claim the catalogue has nothing in it. That claim
// is worth more if it is EVIDENCE rather than an assertion, so both tabs scan
// the tree instead of hard-coding "zero". The scan also catches the case the
// catalogue cannot see: a raster file sitting in public/ that the build agent
// has no way to reach, which is exactly what is there today.
//
// Read-only, no network, and scoped to public/ — the only directory in this
// repo that ships binary media. node_modules and .next are never entered.

const MEDIA_ROOT = "public";
const MAX_SCAN_ENTRIES = 2000;

const RASTER_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".bmp", ".ico", ".tif", ".tiff"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv", ".avi", ".mkv"]);

export type RepoMediaFile = {
  /** Repo-relative, forward-slashed. */
  path: string;
  bytes: number;
  ext: string;
};

export type RepoMediaScan = {
  images: RepoMediaFile[];
  videos: RepoMediaFile[];
  /** Set when the scan could not run — the page says so rather than claiming zero. */
  error: string | null;
};

export async function scanRepoMedia(): Promise<RepoMediaScan> {
  const root = process.cwd();
  const images: RepoMediaFile[] = [];
  const videos: RepoMediaFile[] = [];
  let seen = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (seen++ > MAX_SCAN_ENTRIES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      const isImage = RASTER_EXT.has(ext);
      const isVideo = VIDEO_EXT.has(ext);
      if (!isImage && !isVideo) continue;
      const info = await stat(full);
      const file: RepoMediaFile = {
        path: relative(root, full).split("\\").join("/"),
        bytes: info.size,
        ext,
      };
      (isImage ? images : videos).push(file);
    }
  }

  try {
    await walk(join(root, MEDIA_ROOT));
  } catch (err) {
    return {
      images,
      videos,
      error: err instanceof Error ? err.message : "The public/ directory could not be read.",
    };
  }

  const bySize = (a: RepoMediaFile, b: RepoMediaFile) => b.bytes - a.bytes;
  return { images: images.sort(bySize), videos: videos.sort(bySize), error: null };
}

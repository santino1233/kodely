"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoPreview, svgDataUri } from "./LogoPreview";
import type { BrandKit, BrandPalette, PaletteChoice } from "@/lib/brand-kit";

/**
 * Set a project's brand kit — the customer's own logo, colours and business
 * name — so a generated site looks like their business instead of a nice
 * generic template.
 *
 * These types are imported with `import type`, so they are erased at build time
 * and none of lib/brand-kit (or the 30-preset asset catalogue behind it) ends
 * up in the browser bundle. Everything the panel needs at runtime — the palette
 * list, the size caps, the prompt fragment — arrives from GET.
 *
 * WHAT THIS PANEL DELIBERATELY DOES NOT OFFER
 * A font picker. Generated sites run under a CSP with no `font-src`, so
 * @font-face falls back to `default-src 'self'`, which does not admit `data:`
 * the way `img-src` does — a base64 font is blocked exactly like a remote one.
 * Offering the control and silently ignoring it would be worse than not having it.
 */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40";

const FIELD =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40";

const BTN =
  `rounded-lg border border-black/15 px-3 py-2 text-sm transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10 ${FOCUS_RING}`;

type Limits = {
  SVG_RAW_MAX: number;
  SVG_CLEAN_MAX: number;
  RASTER_DATA_URI_MAX: number;
  RASTER_MAX_EDGE: number;
};

type Payload = {
  kit: BrandKit | null;
  warnings: string[];
  palettes: PaletteChoice[];
  logoTokens: number;
  promptFragment: string | null;
  writes: string[];
  limits: Limits;
};

type LogoDraft =
  | { state: "keep" }
  | { state: "clear" }
  | { state: "svg"; source: string; fileName: string }
  | { state: "raster"; dataUri: string; width: number; height: number; fileName: string };

// ---------------------------------------------------------------------------
// A local copy of the WCAG contrast formula.
//
// lib/brand-kit exports contrastRatio(), and the server uses it for the number
// that actually ships. This duplicate exists so the panel can warn about a bad
// pairing BEFORE a save, without importing the module and pulling the asset
// catalogue into the bundle. Ten lines of arithmetic from a published spec is
// the cheaper of the two duplications.
// ---------------------------------------------------------------------------
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

const NEAR_BLACK = "#0b1120";

function readableInk(bg: string): string {
  return contrast(bg, NEAR_BLACK) >= contrast(bg, "#ffffff") ? NEAR_BLACK : "#ffffff";
}

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * Downscale and re-encode a raster logo in the browser, the same trick
 * components/marketing/PromptHero.tsx uses for reference images — but tuned for
 * a different constraint. There the limit is sessionStorage; here it is the
 * token cost of a data URI that will be re-sent on every turn of every build,
 * so the target is ~16 KB of base64 rather than "legible".
 *
 * PNG first because logos are flat colour with hard edges, where PNG beats a
 * lossy codec at the same size. WebP is tried as a fallback, and the longest
 * edge is stepped down until the result fits. If it still doesn't, the caller
 * tells the user to bring an SVG — which is the right answer anyway.
 */
async function encodeRaster(
  file: File,
  maxEdge: number,
  maxChars: number,
): Promise<{ dataUri: string; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(file);
  for (const edge of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.5)]) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    for (const type of ["image/png", "image/webp"]) {
      const uri = canvas.toDataURL(type);
      if (uri.startsWith(`data:${type}`) && uri.length <= maxChars) {
        return { dataUri: uri, width: w, height: h };
      }
    }
  }
  return null;
}

function samePalette(a: BrandPalette | null, b: BrandPalette | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.presetId === b.presetId &&
    a.primary === b.primary &&
    a.secondary === b.secondary &&
    a.accent === b.accent
  );
}

export default function BrandKitPanel({
  projectId,
  projectName,
  onSaved,
}: {
  projectId: string;
  projectName: string;
  /** Re-read the project's files after a save — a save rewrites two of them. */
  onSaved?: () => void | Promise<void>;
}) {
  const endpoint = `/api/projects/${projectId}/brand`;

  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetId, setPresetId] = useState<string>("ocean");
  const [custom, setCustom] = useState({ primary: "#2563eb", secondary: "#1e3a8a", accent: "#f59e0b" });
  const [logo, setLogo] = useState<LogoDraft>({ state: "keep" });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showFragment, setShowFragment] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  /** Revoked on replace/unmount so a long editing session doesn't leak blobs. */
  const blobUrlRef = useRef<string | null>(null);
  const [pickedPreview, setPickedPreview] = useState<string | null>(null);

  const applyPayload = useCallback((p: Payload) => {
    setData(p);
    setName(p.kit?.businessName ?? "");
    if (p.kit) {
      if (p.kit.palette.presetId) {
        setMode("preset");
        setPresetId(p.kit.palette.presetId);
      } else {
        setMode("custom");
        setCustom({
          primary: p.kit.palette.primary,
          secondary: p.kit.palette.secondary,
          accent: p.kit.palette.accent,
        });
      }
    }
    setLogo({ state: "keep" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint);
        const body = (await res.json()) as Payload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body.error ?? "Couldn't load the brand kit.");
          return;
        }
        applyPayload(body);
        if (!body.kit) setName(projectName);
      } catch {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, projectName, applyPayload]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const chosen: PaletteChoice | undefined = useMemo(
    () => data?.palettes.find((p) => p.id === presetId),
    [data, presetId],
  );

  /** The palette as it will be saved — preset-derived, or the custom hexes. */
  const effective: BrandPalette | null = useMemo(() => {
    if (mode === "preset") return chosen?.palette ?? null;
    if (!isHex(custom.primary)) return null;
    return {
      presetId: null,
      primary: custom.primary.toLowerCase(),
      secondary: isHex(custom.secondary) ? custom.secondary.toLowerCase() : custom.primary.toLowerCase(),
      accent: isHex(custom.accent) ? custom.accent.toLowerCase() : custom.primary.toLowerCase(),
      ink: NEAR_BLACK,
      surface: "#ffffff",
    };
  }, [mode, chosen, custom]);

  const gradient = useMemo(() => {
    if (mode === "preset" && chosen) return chosen.css;
    if (!effective) return "none";
    return `linear-gradient(135deg, ${effective.primary} 0%, ${effective.secondary} 100%)`;
  }, [mode, chosen, effective]);

  const dirty =
    data !== null &&
    (name.trim() !== (data.kit?.businessName ?? "") ||
      !samePalette(effective, data.kit?.palette ?? null) ||
      logo.state !== "keep");

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !data) return;
    setError(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (isSvg) {
      if (file.size > data.limits.SVG_RAW_MAX) {
        setError(`That SVG is ${Math.round(file.size / 1024)} KB — the limit is ${data.limits.SVG_RAW_MAX / 1024} KB.`);
        return;
      }
      const source = await file.text();
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      blobUrlRef.current = url;
      setPickedPreview(url);
      setLogo({ state: "svg", source, fileName: file.name });
      return;
    }

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Logos must be an SVG, PNG, JPEG or WebP file.");
      return;
    }
    try {
      const encoded = await encodeRaster(file, data.limits.RASTER_MAX_EDGE, data.limits.RASTER_DATA_URI_MAX);
      if (!encoded) {
        setError(
          `That image won't fit under ${data.limits.RASTER_DATA_URI_MAX / 1024} KB even scaled down. An SVG has no such limit.`,
        );
        return;
      }
      setPickedPreview(encoded.dataUri);
      setLogo({
        state: "raster",
        dataUri: encoded.dataUri,
        width: encoded.width,
        height: encoded.height,
        fileName: file.name,
      });
    } catch {
      setError("That image couldn't be read.");
    }
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        businessName: name.trim(),
        palette: mode === "preset" ? { presetId } : custom,
        logo: logoForSave(logo, data.kit),
      };
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as Payload & { error?: string };
      if (!res.ok) {
        setError(result.error ?? "Couldn't save the brand kit.");
        return;
      }
      applyPayload(result);
      setPickedPreview(null);
      setSavedAt(Date.now());
      await onSaved?.();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function clearKit() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const result = (await res.json()) as Payload & { error?: string };
      if (!res.ok) {
        setError(result.error ?? "Couldn't clear the brand kit.");
        return;
      }
      applyPayload(result);
      setName(projectName);
      setPickedPreview(null);
      setSavedAt(Date.now());
      await onSaved?.();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-black/50 dark:text-white/50">Loading brand kit…</p>
      </div>
    );
  }

  const savedLogo = data.kit?.logo ?? null;
  const savedLogoSrc =
    savedLogo?.format === "svg"
      ? svgDataUri(savedLogo.markup)
      : savedLogo?.format === "raster"
        ? savedLogo.dataUri
        : null;
  const ink = effective ? readableInk(effective.primary) : NEAR_BLACK;
  const inkRatio = effective ? contrast(effective.primary, ink) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <header>
          <h2 className="text-lg font-semibold">Brand kit</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Your logo, your colours and your business name. The builder is given these as exact
            values, so a generated site looks like your business rather than a template.
          </p>
        </header>

        {/* ── Business name ───────────────────────────────────────────── */}
        <section className="space-y-2">
          <label htmlFor="brand-name" className="block text-sm font-medium">
            Business name
          </label>
          <input
            id="brand-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bloom Pilates"
            className={`${FIELD} ${FOCUS_RING}`}
          />
          <p className="text-xs text-black/50 dark:text-white/50">
            Used verbatim in the header, the footer and the page title.
          </p>
        </section>

        {/* ── Logo ────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Logo</h3>

          <div className="flex flex-wrap items-start gap-4">
            {pickedPreview ? (
              <div className="space-y-1">
                <LogoPreview src={pickedPreview} label="The logo file you picked" className="h-20 w-40" />
                <p className="text-xs text-black/50 dark:text-white/50">Not saved yet</p>
              </div>
            ) : savedLogoSrc ? (
              <>
                <div className="space-y-1">
                  <LogoPreview src={savedLogoSrc} label="Your saved logo on a light background" className="h-20 w-40" />
                  <p className="text-xs text-black/50 dark:text-white/50">On light</p>
                </div>
                <div className="space-y-1">
                  <LogoPreview src={savedLogoSrc} label="Your saved logo on a dark background" onDark className="h-20 w-40" />
                  <p className="text-xs text-black/50 dark:text-white/50">On dark</p>
                </div>
              </>
            ) : (
              <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-black/20 text-xs text-black/40 dark:border-white/20 dark:text-white/40">
                No logo yet
              </div>
            )}

            <div className="space-y-2">
              {/* `hidden` keeps this out of the accessibility tree and out of
                  the tab order; the labelled button below is the real control,
                  the same arrangement components/marketing/PromptHero.tsx uses. */}
              <input
                ref={fileRef}
                type="file"
                accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
                onChange={onPickFile}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN} onClick={() => fileRef.current?.click()}>
                  Choose a logo file
                </button>
                {(savedLogo || logo.state !== "keep") && (
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => {
                      if (blobUrlRef.current) {
                        URL.revokeObjectURL(blobUrlRef.current);
                        blobUrlRef.current = null;
                      }
                      setPickedPreview(null);
                      setLogo({ state: "clear" });
                    }}
                  >
                    Remove logo
                  </button>
                )}
              </div>
              {logo.state === "svg" || logo.state === "raster" ? (
                <p className="text-xs text-black/60 dark:text-white/60">{logo.fileName}</p>
              ) : logo.state === "clear" ? (
                <p className="text-xs text-black/60 dark:text-white/60">Will be removed when you save.</p>
              ) : null}
              <p className="max-w-xs text-xs text-black/50 dark:text-white/50">
                SVG is best — it stays sharp at any size. PNG, JPEG and WebP are scaled to{" "}
                {data.limits.RASTER_MAX_EDGE}px on their longest edge before upload, which is enough
                for a header lockup at 2x.
              </p>
              {data.logoTokens > 0 && (
                <p className="max-w-xs text-xs text-black/50 dark:text-white/50">
                  Your saved logo adds roughly {data.logoTokens.toLocaleString()} tokens to every
                  build — about ${((data.logoTokens * 4 * 3) / 1_000_000).toFixed(3)} per build at
                  current rates.
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-black/50 dark:text-white/50">
            An uploaded SVG is cleaned on the server before it is used: scripts, event handlers,
            embedded CSS, external links and animation are refused outright, and anything else
            outside a small allowlist of shapes and paint attributes is stripped.
          </p>
        </section>

        {/* ── Palette ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Colours</h3>
            <div className="flex gap-1 text-xs" role="group" aria-label="Palette source">
              <button
                type="button"
                onClick={() => setMode("preset")}
                aria-pressed={mode === "preset"}
                className={`rounded-md px-2 py-1 ${FOCUS_RING} ${
                  mode === "preset" ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 dark:text-white/60"
                }`}
              >
                From the catalogue
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                aria-pressed={mode === "custom"}
                className={`rounded-md px-2 py-1 ${FOCUS_RING} ${
                  mode === "custom" ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 dark:text-white/60"
                }`}
              >
                My own hex values
              </button>
            </div>
          </div>

          {mode === "preset" ? (
            <fieldset>
              <legend className="sr-only">Choose a palette</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.palettes.map((p) => {
                  const active = p.id === presetId;
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${
                        active
                          ? "border-black bg-black/5 dark:border-white dark:bg-white/10"
                          : "border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/5"
                      } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-black/40 dark:has-[:focus-visible]:ring-white/40`}
                    >
                      <input
                        type="radio"
                        name="brand-palette"
                        value={p.id}
                        checked={active}
                        onChange={() => setPresetId(p.id)}
                        className="sr-only"
                      />
                      {/* No text sits on this swatch — it is a colour sample,
                          and label text over a gradient is exactly the
                          contrast failure this feature is meant to avoid. */}
                      <span
                        aria-hidden="true"
                        className="h-8 w-8 shrink-0 rounded-md border border-black/10 dark:border-white/10"
                        style={{ backgroundImage: p.css }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{p.name}</span>
                        <span className="block truncate font-mono text-[11px] text-black/45 dark:text-white/45">
                          {p.palette.primary} · {p.palette.secondary}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {(["primary", "secondary", "accent"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <label htmlFor={`brand-${key}`} className="block text-sm capitalize">
                    {key}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${key} colour picker`}
                      value={isHex(custom[key]) ? custom[key] : "#000000"}
                      onChange={(e) => setCustom((c) => ({ ...c, [key]: e.target.value }))}
                      className={`h-9 w-9 shrink-0 cursor-pointer rounded-md border border-black/15 bg-transparent dark:border-white/15 ${FOCUS_RING}`}
                    />
                    <input
                      id={`brand-${key}`}
                      value={custom[key]}
                      onChange={(e) => setCustom((c) => ({ ...c, [key]: e.target.value }))}
                      spellCheck={false}
                      className={`${FIELD} ${FOCUS_RING} font-mono`}
                    />
                  </div>
                  {!isHex(custom[key]) && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Needs a six-digit hex value, like #2563eb.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {effective && (
            <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div
                aria-hidden="true"
                className="h-10 rounded-md border border-black/10 dark:border-white/10"
                style={{ backgroundImage: gradient }}
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                {(
                  [
                    ["Primary", effective.primary],
                    ["Secondary", effective.secondary],
                    ["Accent", effective.accent],
                    ["Text on primary", ink],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-sm border border-black/15 dark:border-white/15"
                      style={{ backgroundColor: value }}
                    />
                    <div className="min-w-0">
                      <dt className="truncate text-black/60 dark:text-white/60">{label}</dt>
                      <dd className="font-mono text-black/80 dark:text-white/80">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p
                className={`text-xs ${
                  inkRatio >= 4.5 ? "text-black/50 dark:text-white/50" : "text-amber-700 dark:text-amber-400"
                }`}
              >
                Text on the primary colour will be {ink} at {inkRatio.toFixed(1)}:1
                {inkRatio >= 4.5
                  ? " — passes WCAG AA for body text."
                  : " — below WCAG AA (4.5:1). Buttons and headings on this colour will be hard to read; pick a darker or lighter primary."}
              </p>
            </div>
          )}
        </section>

        {/* ── What the builder is actually told ───────────────────────── */}
        {data.promptFragment && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowFragment((v) => !v)}
              aria-expanded={showFragment}
              aria-controls="brand-fragment"
              className={`text-sm underline underline-offset-4 ${FOCUS_RING} rounded`}
            >
              {showFragment ? "Hide" : "Show"} exactly what the builder is told
            </button>
            {showFragment && (
              <pre
                id="brand-fragment"
                className="overflow-x-auto rounded-lg border border-black/10 bg-black/[0.03] p-3 text-[11px] leading-relaxed dark:border-white/10 dark:bg-white/5"
              >
                {data.promptFragment}
              </pre>
            )}
          </section>
        )}

        {/* ── Save ────────────────────────────────────────────────────── */}
        <section className="space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
          {data.warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div aria-live="polite" className="min-h-[1.25rem] text-xs">
            {error ? (
              <span className="text-red-600 dark:text-red-400">{error}</span>
            ) : savedAt ? (
              <span className="text-black/60 dark:text-white/60">
                Saved. {data.writes.join(" and ")} were updated — your next build will use them.
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty || !name.trim() || !effective}
              className={`rounded-lg bg-black px-4 py-2 text-sm text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-black ${FOCUS_RING}`}
            >
              {busy ? "Saving…" : "Save brand kit"}
            </button>
            {data.kit && (
              <button type="button" onClick={clearKit} disabled={busy} className={BTN}>
                Clear brand kit
              </button>
            )}
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">
            Saving rewrites {data.writes.join(" and ")} in your project&apos;s source. It does not
            rebuild the site and it never touches a published one — the change shows up the next
            time you generate.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Turn the draft into the `logo` field of a PUT body. */
function logoForSave(draft: LogoDraft, saved: BrandKit | null) {
  switch (draft.state) {
    case "clear":
      return null;
    case "svg":
      return { format: "svg" as const, source: draft.source };
    case "raster":
      return {
        format: "raster" as const,
        dataUri: draft.dataUri,
        width: draft.width,
        height: draft.height,
      };
    case "keep":
      if (!saved?.logo) return null;
      // Re-submitting already-sanitised markup is idempotent, so "keep" needs
      // no special case on the server: it re-runs the same allowlist over
      // output the same allowlist produced.
      return saved.logo.format === "svg"
        ? { format: "svg" as const, source: saved.logo.markup }
        : {
            format: "raster" as const,
            dataUri: saved.logo.dataUri,
            width: saved.logo.width,
            height: saved.logo.height,
          };
  }
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Menu } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import BuildVeil from "./BuildVeil";
import type { BuildRun } from "./build-steps";

// The preview pane, dressed as a browser: an address row that says what you
// are looking at, a width switcher, zoom, refresh, open-in-a-real-tab and
// fullscreen.
//
// THE PARTS THAT MUST NOT CHANGE, and why (all verified in preview-agent.ts,
// which has the measurements):
//
//  * The iframe is fed a SELF-CONTAINED document through `srcdoc`, never
//    pointed at a URL. Every subresource request made from inside this frame
//    is treated as cross-site and arrives without the session cookie, so a
//    preview assembled out of separate asset requests cannot load at all.
//  * `sandbox="allow-scripts allow-forms"` with NO `allow-same-origin`.
//    Adding it would hand generated customer code our own origin.
//  * The iframe element is not re-keyed when the width or the zoom changes, so
//    those resize the live page instead of reloading it. That is the
//    difference between testing a responsive layout and testing a page load.
//    Only `reloadKey` re-keys it, which is what Refresh bumps.
//
// WHAT IS DELIBERATELY ABSENT
//
//  * No rounded phone shell and no notch. A device chrome would imply we are
//    emulating a device; we are changing a width, and the pixel number next to
//    the label is the thing worth trusting.
//  * No "test your form" affordance. Forms in the DRAFT preview do nothing —
//    submissions are only wired for published sites (lib/site-forms.ts), and
//    app/api/preview/…/route.ts says so at length. A button that appeared to
//    test one would discard the enquiry it was pretending to send.
//  * The address row is not an input. There is nothing to navigate to: the
//    assembled document is one page with no URL of its own (it runs from
//    about:srcdoc), so a text field you could type into would be a control
//    that cannot do the only thing an address bar does.

export type DeviceId = "desktop" | "tablet" | "mobile";

export const DEVICES: { id: DeviceId; label: string; width: number | null; note: string }[] = [
  { id: "desktop", label: "Desktop", width: null, note: "full width" },
  { id: "tablet", label: "Tablet", width: 768, note: "768px" },
  // 380 rather than a real handset width: it is the floor the site generator
  // is told to support, so it is the number worth testing against.
  { id: "mobile", label: "Mobile", width: 380, note: "380px" },
];

/** Zoom exists so a 768px frame fits beside the chat on a 1366px laptop. It
    scales the RENDERED result and leaves the layout width alone — the device
    toggle is what changes the layout width, and conflating the two would make
    the "768px" label a lie. */
type ZoomId = "fit" | "75" | "50" | "100";

const ZOOMS: { id: ZoomId; label: string }[] = [
  { id: "fit", label: "Fit to pane" },
  { id: "100", label: "100%" },
  { id: "75", label: "75%" },
  { id: "50", label: "50%" },
];

/** A menu has no checked state, so the current choice carries its own mark.
    The empty box keeps every row's label on the same left edge. */
function Tick({ on }: { on: boolean }) {
  if (!on) return <span className="block size-3.5" />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 text-brand" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 12.5 5 5L20 7" />
    </svg>
  );
}

function DeviceIcon({ id }: { id: DeviceId }): ReactNode {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const };
  if (id === "desktop") {
    return (
      <svg viewBox="0 0 24 24" className="size-4" {...common}>
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M9 20h6" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "tablet") {
    return (
      <svg viewBox="0 0 24 24" className="size-4" {...common}>
        <rect x="5" y="2.5" width="14" height="19" rx="2" />
        <path d="M11 18.5h2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...common}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" strokeLinecap="round" />
    </svg>
  );
}

export type OpenTargets = {
  /** Full-tab view of the DRAFT. Same assembled document, own real URL. */
  draftHref: string;
  /** The published site, when there is one. */
  liveHref: string | null;
};

export default function PreviewFrame({
  doc,
  loading,
  error,
  reloadKey,
  device,
  onDeviceChange,
  frameRef,
  selectMode,
  selectAvailable,
  onToggleSelectMode,
  onRefresh,
  open,
  host,
  published,
  pageCount,
  missing,
  busy,
  run,
  emptyAction,
}: {
  /** The assembled document, or null before the first load finishes. */
  doc: string | null;
  loading: boolean;
  error: string | null;
  reloadKey: number;
  device: DeviceId;
  onDeviceChange: (device: DeviceId) => void;
  frameRef: RefObject<HTMLIFrameElement | null>;
  selectMode: boolean;
  /** The preview answered the handshake, so the toggle can do something. */
  selectAvailable: boolean;
  onToggleSelectMode: () => void;
  onRefresh: () => void;
  open: OpenTargets;
  /** Where this site lives (or will live) — shown, never typed into. */
  host: string;
  published: boolean;
  /** Root .html files in the source tree. More than one means the preview is
      showing only part of the site, which the customer has to be told. */
  pageCount: number;
  /** Build paths index.html referenced that could not be inlined. */
  missing: string[];
  /** A build is running: blur the site and put the progress veil over it. */
  busy: boolean;
  run: BuildRun | null;
  /** Rendered in the "nothing built yet" state — the composer is the action,
      so this is a pointer at it rather than a second button that builds. */
  emptyAction?: ReactNode;
}) {
  const active = DEVICES.find((d) => d.id === device) ?? DEVICES[0];
  const [zoom, setZoom] = useState<ZoomId>("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

  // Measured rather than assumed: "Fit" has to know how much room the pane
  // actually has, and that changes with the window, the chat width and
  // fullscreen. A ResizeObserver is the only thing that sees all three.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    setStageWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    // Guarded rather than assumed available: requestFullscreen rejects (it does
    // not throw synchronously) when the browser refuses, and an unhandled
    // rejection in a click handler is a console error nobody sees.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void shellRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Desktop has no fixed width to scale, so there is nothing for zoom to do
  // that the pane is not already doing.
  const zoomable = active.width !== null;
  const scale = (() => {
    if (!zoomable || active.width === null) return 1;
    if (zoom === "fit") return stageWidth > 0 ? Math.min(1, stageWidth / active.width) : 1;
    return Number(zoom) / 100;
  })();

  const zoomLabel = !zoomable
    ? "100%"
    : zoom === "fit"
      ? `Fit · ${Math.round(scale * 100)}%`
      : `${zoom}%`;

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col bg-canvas">
      {/* ── Browser chrome ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hair bg-surface px-2.5 py-2">
        <IconButton
          label="Reload the preview"
          size="sm"
          onClick={onRefresh}
          disabled={busy}
          className="shrink-0"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 1 0-.6 4" />
            <path d="M20 4v7h-7" />
          </svg>
        </IconButton>

        {/* The address row. Read-only by design (see the note at the top) — it
            reports which of the two copies of this site you are looking at,
            which is the question people actually get wrong. */}
        <div className="flex h-8 min-w-0 flex-1 basis-40 items-center gap-2 rounded-md border border-hair bg-surface-2 px-2.5">
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
          </svg>
          <span className="k-num min-w-0 truncate font-mono text-[0.75rem] text-ink-2">{host}</span>
          <Badge tone={published ? "info" : "neutral"} className="shrink-0">
            {published ? "Draft — live version differs" : "Draft"}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Segmented
            name="kodely-preview-device"
            ariaLabel="Preview width"
            size="sm"
            value={device}
            onChange={onDeviceChange}
            options={DEVICES.map((d) => ({
              value: d.id,
              label: `${d.label} — ${d.note}`,
              iconOnly: true,
              icon: <DeviceIcon id={d.id} />,
            }))}
          />

          <Menu
            align="end"
            trigger={(p) => (
              <button
                {...p}
                type="button"
                aria-label={`Preview zoom, currently ${zoomLabel}`}
                className="k-focus k-num inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-hair px-2 text-[0.75rem] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {zoomLabel}
                <svg viewBox="0 0 24 24" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
            items={ZOOMS.map((z) => ({
              kind: "item" as const,
              label: z.label,
              icon: <Tick on={z.id === zoom} />,
              onSelect: () => setZoom(z.id),
              // Greyed with the reason rather than hidden: someone hunting for
              // zoom should find it and be told why it is inert here.
              unavailableReason: zoomable ? undefined : "Desktop already fills the pane",
            }))}
          />

          <Menu
            align="end"
            trigger={(p) => (
              <button
                {...p}
                ref={p.ref}
                type="button"
                aria-label="Open the preview elsewhere"
                title="Open in a new tab"
                className="k-focus inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-hair text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 4h6v6M20 4l-8.5 8.5" />
                  <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
                </svg>
              </button>
            )}
            items={[
              { kind: "label", label: "Open in a new tab" },
              {
                kind: "item",
                label: "This draft, full screen",
                // A real page inside the app (app/projects/[id]/preview) that
                // assembles the same self-contained document. It cannot be
                // /api/preview/<id>/index.html: Vite emits absolute
                // /assets/… URLs, which from a top-level tab resolve against
                // the app origin and 404. Inlining is the only thing that
                // makes the draft renderable anywhere.
                onSelect: () => window.open(open.draftHref, "_blank", "noopener"),
              },
              {
                kind: "item",
                label: "The published site",
                onSelect: () => {
                  if (open.liveHref) window.open(open.liveHref, "_blank", "noopener");
                },
                unavailableReason: open.liveHref ? undefined : "not published yet",
              },
            ]}
          />

          <IconButton
            label={fullscreen ? "Leave fullscreen" : "Fullscreen"}
            size="sm"
            variant="ghost"
            onClick={toggleFullscreen}
            className="border border-hair"
          >
            {fullscreen ? (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            )}
          </IconButton>
        </div>
      </div>

      {/* ── Second row: what you can do TO the page ─────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair bg-surface px-2.5 py-1.5">
        <Button
          size="xs"
          variant={selectMode ? "soft" : "ghost"}
          aria-pressed={selectMode}
          disabled={!selectAvailable || busy}
          onClick={onToggleSelectMode}
          title={
            selectAvailable
              ? "Click an element in the preview to refer to it in your next change"
              : "Available once the preview has loaded"
          }
          icon={
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 3 5.5 16 2.2-6.3L19 10.5z" />
            </svg>
          }
        >
          {selectMode ? "Selecting…" : "Select element"}
        </Button>

        <div className="flex min-w-0 items-center gap-2 text-[0.6875rem] text-ink-3">
          {/* The number matters more than the label — "Mobile" is a guess,
              "380px" is a fact you can compare a bug report against. */}
          <span className="k-num shrink-0">
            {active.note}
            {zoomable && scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
          </span>
        </div>
      </div>

      {/* Two honest caveats about what this pane can and cannot show. Both are
          derived from real data, so neither appears when it does not apply. */}
      {(pageCount > 1 || missing.length > 0) && (
        <div className="flex flex-col gap-1 border-b border-hair bg-surface-2/60 px-3 py-1.5 text-[0.6875rem] leading-relaxed text-ink-2">
          {pageCount > 1 && (
            <p>
              This site has <span className="k-num">{pageCount}</span> pages. The preview shows the
              home page only — the others are real and are served on the published site.
            </p>
          )}
          {missing.length > 0 && (
            <p className="text-warn">
              <span className="k-num">{missing.length}</span> file
              {missing.length === 1 ? "" : "s"} the built page references could not be loaded, so
              the preview may be incomplete. The published site is unaffected.
            </p>
          )}
        </div>
      )}

      {/* ── The page itself ──────────────────────────────────────────────── */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-inset">
        {error ? (
          <div className="m-auto max-w-md px-6 py-10">
            <EmptyState
              kind="unavailable"
              title="The preview didn’t load"
              body={error}
              action={
                <Button size="sm" onClick={onRefresh}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : doc === null && loading ? (
          <div className="m-auto flex items-center gap-2 px-6 text-sm text-ink-3">
            <Spinner size={16} />
            Loading preview…
          </div>
        ) : doc === null ? (
          <div className="m-auto max-w-md px-6 py-10">
            <EmptyState
              kind="empty"
              title="No site here yet"
              body="Describe what you want in the chat and Kodely will build it. You’ll see it appear right here."
              action={emptyAction}
            />
          </div>
        ) : (
          // The scaled frame keeps a box of its real rendered size so the
          // scroll container measures what it can see, not the unscaled
          // element — otherwise a zoomed-out 768px frame still demands 768px
          // of horizontal scroll it no longer occupies.
          <div
            className="shrink-0"
            style={
              active.width !== null
                ? { width: active.width * scale, height: "100%" }
                : { width: "100%", height: "100%" }
            }
          >
            <iframe
              key={reloadKey}
              ref={frameRef}
              srcDoc={doc}
              sandbox="allow-scripts allow-forms"
              title={`Live preview at ${active.note}`}
              style={
                active.width !== null
                  ? {
                      width: active.width,
                      height: `${100 / scale}%`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
              className={[
                "bg-white",
                busy ? "k-preview-busy" : "k-preview-idle",
                active.width !== null
                  ? "border-x border-hair"
                  : "h-full w-full border-0",
              ].join(" ")}
            />
          </div>
        )}

        {busy && run && <BuildVeil run={run} />}
      </div>
    </div>
  );
}

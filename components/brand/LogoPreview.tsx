"use client";

/**
 * A logo, drawn as a CSS background-image rather than inline markup.
 *
 * THIS IS A SECURITY DECISION, NOT A STYLING ONE. The panel needs to show an
 * SVG the user just picked off their disk, before the server has sanitised it.
 * Inlining that markup — `dangerouslySetInnerHTML`, or a parsed-and-rebuilt
 * DOM — would execute whatever is in it, inside kodely.site, with the user's
 * session cookie in scope. An image context cannot: browsers refuse to run
 * script in an SVG loaded through `<img>` or `background-image`, which is the
 * whole reason that restriction exists in the HTML spec.
 *
 * `background-image` rather than `<img>` only because the repo's ESLint config
 * (eslint-config-next/core-web-vitals) warns on a bare `<img>`, and the gate on
 * this work is zero warnings. `role="img"` plus a label keeps it announced.
 */
export function LogoPreview({
  src,
  label,
  onDark,
  className = "",
}: {
  /** Any image URL — a `data:` URI or a blob: URL from the file the user picked. */
  src: string;
  label: string;
  /** Draw on a dark checkerboard instead of a light one. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`rounded-lg border ${
        onDark ? "border-white/15 bg-neutral-900" : "border-black/10 bg-white"
      } ${className}`}
      style={{
        backgroundImage: `url("${src.replace(/"/g, '%22')}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
        backgroundOrigin: "content-box",
        padding: "0.75rem",
      }}
    />
  );
}

/** Sanitised SVG markup -> a data: URI the preview can draw. */
export function svgDataUri(markup: string): string {
  return `data:image/svg+xml,${encodeURIComponent(markup).replace(/'/g, "%27")}`;
}

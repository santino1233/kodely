/**
 * "Skip to content" — the first tab stop on a page, letting a keyboard or
 * screen-reader user jump past the fixed nav (WCAG 2.4.1, Bypass Blocks)
 * instead of tabbing through it on every page.
 *
 * Visually hidden until focused, so it changes nothing about the design;
 * `sr-only` + `focus:not-sr-only` is Tailwind's built-in idiom for that and
 * needs no globals.css change. It must be rendered BEFORE <MarketingNav />
 * to actually be the first stop, and the page must carry a matching
 * `id="main-content"` on its <main>.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] dark:focus:bg-white dark:focus:text-neutral-900"
    >
      Skip to content
    </a>
  );
}

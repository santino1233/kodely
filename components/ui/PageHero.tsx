import type { ReactNode } from "react";

/**
 * The liquid-glass page header. One shared recipe (`.k-hero` in
 * app/globals.css) for every top-level portal page, so a customer moving
 * dashboard → websites → usage → settings reads one consistent "this is the
 * top of a page" signal instead of eight ad hoc headers.
 *
 * Deliberately narrow: an icon badge, a title, a description, an optional
 * action, and an optional `children` slot for whatever real content used to
 * sit directly under that page's old plain header (stat rows, a CTA, a range
 * switcher). This component owns none of that content's behaviour — it only
 * gives it a consistent frame to sit in.
 *
 * `as` mirrors SectionHeader's own prop for the same reason: most pages using
 * this render exactly one page title, so it defaults to "h1". A page that
 * already has a real `<h1>` elsewhere must pass `as="h2"` rather than the
 * document acquiring two.
 */
export function PageHero({
  icon,
  title,
  description,
  action,
  children,
  as: Heading = "h1",
  className = "",
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <section className={`k-hero rounded-2xl p-6 sm:p-8 ${className}`}>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            aria-hidden
            className="k-hero-icon grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand shadow-e1 sm:size-12"
          >
            {icon}
          </span>
          <div className="min-w-0 pt-0.5">
            <Heading className="k-display text-ink">{title}</Heading>
            {description != null && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{description}</p>
            )}
          </div>
        </div>
        {action != null && <div className="relative shrink-0">{action}</div>}
      </div>
      {children != null && <div className="relative mt-5">{children}</div>}
    </section>
  );
}

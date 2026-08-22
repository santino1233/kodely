import type { ComponentProps, ElementType, ReactNode } from "react";

/* The panel every surface in the product is made of. `interactive` is
   separate from `as="a"` on purpose — a card can be clickable without being a
   link (a form target, a drawer opener), and only the ones that actually
   respond should lift on hover. A card that lifts but does nothing is a lie
   the cursor tells. */
export function Card({
  as: Tag = "div",
  interactive = false,
  padded = true,
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  interactive?: boolean;
  padded?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "className" | "children">) {
  return (
    <Tag
      {...rest}
      className={[
        "rounded-xl border border-hair bg-surface shadow-e1",
        padded ? "p-5" : "",
        interactive
          ? "k-focus transition-[box-shadow,border-color,transform] duration-[var(--t-2)] hover:-translate-y-0.5 hover:border-line-mid hover:shadow-e2"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="k-h2 text-ink">{title}</h2>
        {description != null && (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{description}</p>
        )}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A page-level section heading. Distinct from CardHeader: this one sits on
    the canvas, not inside a panel, and so carries no background of its own.

    `as` exists because this component hardcoded `<h2>`, and seven portal pages
    used it as their page title — so those documents began their outline at h2
    with no h1 at all. The default stays `"h2"` rather than flipping to `"h1"`:
    most pages render this more than once, and a component that silently emits
    a second h1 is a worse defect than the one being fixed. The FIRST one on a
    page passes `as="h1"`; the rest are genuinely sections. */
export function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {/* k-h1 is the SIZE token and is unrelated to the tag — a page title
            and a section title are set alike here by design. */}
        <Heading className="k-h1 text-ink">{title}</Heading>
        {description != null && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

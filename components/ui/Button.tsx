import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

/* One button, five variants, and a hard rule: exactly ONE primary per view.
   The old portal had four visually identical links in its header and no
   obvious next action, which is most of why it read as generic. */
const VARIANT: Record<ButtonVariant, string> = {
  // The only element in the product that carries the brand gradient as a
  // fill. `group` + the two .btn-* classes reuse the marketing CTA treatment
  // verbatim so the "Create Website" button feels like the same object the
  // customer clicked on the marketing site.
  primary:
    "group relative overflow-hidden text-white btn-cta-gradient shadow-e2 hover:shadow-e3 active:translate-y-px",
  secondary:
    "bg-surface text-ink border border-line-mid hover:bg-surface-2 hover:border-line-strong shadow-e1",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  soft: "bg-brand-tint text-brand-ink hover:bg-brand-tint-2 dark:text-brand",
  danger: "bg-danger-tint text-danger hover:brightness-95 dark:hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 px-2.5 text-xs rounded-sm",
  sm: "h-8 gap-1.5 px-3 text-[0.8125rem] rounded-md",
  md: "h-9.5 gap-2 px-4 text-sm rounded-md",
  lg: "h-11.5 gap-2 px-5 text-[0.9375rem] rounded-lg",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return [
    "k-focus inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
    "transition-[background,color,box-shadow,border-color,transform] duration-[var(--t-1)]",
    "disabled:pointer-events-none disabled:opacity-45",
    SIZE[size],
    VARIANT[variant],
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The gradient variant needs a sheen element inside it; nothing else does. */
function Shine({ variant }: { variant: ButtonVariant }) {
  if (variant !== "primary") return null;
  return (
    <span
      aria-hidden
      className="btn-shine pointer-events-none absolute top-0 left-[-40%] h-full w-[35%] skew-x-[-20deg] bg-white/25"
    />
  );
}

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner in place of `icon`, sets aria-busy, and disables. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  ...rest
}: BaseProps & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
    >
      <Shine variant={variant} />
      {/* The icon slot keeps its box while loading so the label never shifts
          sideways at the moment the customer clicks. */}
      {loading ? <Spinner size={size === "lg" ? 16 : 14} /> : icon}
      {children != null && <span className="relative">{children}</span>}
      {!loading && iconRight}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  icon,
  iconRight,
  className,
  children,
  ...rest
}: BaseProps & Omit<ComponentProps<typeof Link>, "children">) {
  return (
    <Link {...rest} className={buttonClass({ variant, size, block, className })}>
      <Shine variant={variant} />
      {icon}
      {children != null && <span className="relative">{children}</span>}
      {iconRight}
    </Link>
  );
}

/** Square icon-only button. Requires a label — an unlabelled icon button is
    invisible to a screen reader and, collapsed in the sidebar, to everyone. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & Omit<ComponentProps<"button">, "children"> & { children: ReactNode }) {
  const square = { xs: "size-7", sm: "size-8", md: "size-9.5", lg: "size-11.5" }[size];
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={buttonClass({
        variant,
        size,
        className: `!px-0 ${square} ${className}`,
      })}
    >
      {children}
    </button>
  );
}

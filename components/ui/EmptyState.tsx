import type { ReactNode } from "react";

/* Three distinct empty states exist and conflating them is the usual mistake:
   NOTHING YET (you have not made one), NOTHING MATCHED (your filter is too
   narrow), and NOT AVAILABLE (this does not exist in the product yet). Each
   needs a different sentence and a different — or absent — action, so `tone`
   is a required decision rather than a default. */
export function EmptyState({
  kind,
  title,
  body,
  action,
  icon,
  className = "",
}: {
  kind: "empty" | "no-results" | "unavailable";
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-xl px-6 py-14 text-center",
        kind === "unavailable"
          ? "border border-hair bg-surface-2/60"
          : "border border-dashed border-line-mid bg-surface/40",
        className,
      ].join(" ")}
    >
      {icon != null && <div className="mb-4 text-ink-3">{icon}</div>}
      <p className="k-h2 text-ink">{title}</p>
      {body != null && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">{body}</p>
      )}
      {action != null && <div className="mt-5">{action}</div>}
    </div>
  );
}

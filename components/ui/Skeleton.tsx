/* Reuses the .kodely-skeleton treatment the build overlay already uses, so a
   loading dashboard and a building site shimmer identically. `delay` staggers
   a stack of them into a wave rather than one synchronised flash. */
export function Skeleton({
  className = "",
  delay = 0,
  rounded = "rounded-md",
}: {
  className?: string;
  delay?: number;
  rounded?: string;
}) {
  return (
    <div
      aria-hidden
      className={`kodely-skeleton ${rounded} ${className}`}
      style={{ animationDelay: `${delay}ms, ${delay}ms` }}
    />
  );
}

/** Announces that something is loading without describing what — pair it with
    a visually hidden live message where the wait is long enough to matter. */
export function SkeletonList({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" delay={i * 70} rounded="rounded-lg" />
      ))}
    </div>
  );
}

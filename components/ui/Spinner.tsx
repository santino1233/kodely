/* An SVG arc rather than a bordered div: a border-based spinner inherits the
   element's border-radius and colour rules and goes wrong inside buttons that
   already set both. This one only ever needs currentColor. */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`animate-spin ${className}`}
      style={{ animationDuration: "0.7s" }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      <span className="brand-gradient-text">kodely</span>
    </span>
  );
}

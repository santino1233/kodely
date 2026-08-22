/* Initials on a brand-tinted disc. Deliberately not a photo-first component:
   there is no avatar upload in the product, and rendering a broken <img>
   whenever the field is empty is exactly the kind of half-built thing the
   redesign is meant to remove. Add the image branch when uploads exist. */
export function Avatar({
  name,
  email,
  size = 32,
  className = "",
}: {
  name?: string | null;
  email: string;
  size?: number;
  className?: string;
}) {
  const source = (name?.trim() || email.split("@")[0] || "?").trim();
  // Two initials from a real name, one from an email local part — "haxkodi"
  // has no second word and "HA" from a single token reads as a typo.
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials =
    parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : source.slice(0, 1).toUpperCase();

  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full bg-brand-tint-2 font-semibold text-brand-ink dark:text-brand ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}

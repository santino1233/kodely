// lucide-react dropped trademarked brand glyphs from its icon set, so these
// are small hand-drawn outline icons matched to the same stroke style
// (currentColor, ~1.75 stroke) used everywhere else lucide is used on this
// site, sized to drop straight into the footer's icon-button row.
type IconProps = { size?: number };

export function InstagramIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path d="M15 8.5h-2a1.5 1.5 0 0 0-1.5 1.5v2H15l-.5 3H11.5v7h-3v-7H6.5v-3H8.5V9.5A4 4 0 0 1 12.5 5.5H15v3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function YoutubeIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" strokeLinejoin="round" fill="currentColor" />
    </svg>
  );
}

export function LinkedinIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="7.5" y1="10.5" x2="7.5" y2="16.5" />
      <circle cx="7.5" cy="7.2" r="0.2" fill="currentColor" strokeWidth={1.4} />
      <path d="M11.5 16.5v-3.5a2 2 0 0 1 4 0v3.5" strokeLinecap="round" />
      <line x1="11.5" y1="10.5" x2="11.5" y2="16.5" />
    </svg>
  );
}

import Link from "next/link";
import { InstagramIcon, FacebookIcon, YoutubeIcon, LinkedinIcon } from "./SocialIcons";
import { Logo } from "./Logo";
import { AuthLink } from "./AuthLink";

const SOCIALS = [
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "Facebook", href: "#", Icon: FacebookIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
  { label: "LinkedIn", href: "#", Icon: LinkedinIcon },
];

/** `signedIn` is optional for the same reason it is on MarketingNav: the
 *  pages that already render per request pass the authoritative answer down,
 *  the statically prerendered ones let AuthLink resolve it in the browser. */
export function MarketingFooter({ signedIn }: { signedIn?: boolean }) {
  return (
    <footer className="relative border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-40"
        style={{ background: "var(--brand-gradient)" }}
        aria-hidden
      />
      {/* Contrast: dark:text-neutral-500 was 4.2:1 on the dark page (AA
          wants 4.5:1 at this size) and the tagline's neutral-400 /
          dark:neutral-600 were ~2.5:1 in both themes. */}
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 text-sm text-neutral-500 sm:flex-row sm:justify-between dark:text-neutral-400">
        <Link href="/" className="flex items-center gap-2">
          <Logo markSize={18} className="text-sm" />
          <span className="hidden text-neutral-500 sm:inline dark:text-neutral-400">AI websites, simplified.</span>
        </Link>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/templates" className="hover:text-neutral-900 dark:hover:text-white">
            Templates
          </Link>
          <Link href="/pricing" className="hover:text-neutral-900 dark:hover:text-white">
            Pricing
          </Link>
          <Link href="/blog" className="hover:text-neutral-900 dark:hover:text-white">
            Blog
          </Link>
          {/* The footer is the conventional home for this, and it was the only
              thing keeping /status unreachable. `flex-wrap` added with it —
              six links no longer fit on one line at 380px. */}
          <Link href="/status" className="hover:text-neutral-900 dark:hover:text-white">
            Status
          </Link>
          <Link href="/contact" className="hover:text-neutral-900 dark:hover:text-white">
            Contact
          </Link>
          <AuthLink
            signedIn={signedIn}
            className="hover:text-neutral-900 dark:hover:text-white"
          />
        </div>

        <div className="flex items-center gap-3">
          {SOCIALS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-white"
            >
              <Icon size={15} />
            </a>
          ))}
        </div>

        {/* Contrast: Privacy and Terms are legally-important links and were
            at ~2.5:1 in both themes. */}
        <p className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/legal/privacy" className="hover:text-neutral-700 dark:hover:text-neutral-300">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-neutral-700 dark:hover:text-neutral-300">
            Terms
          </Link>
          <span>© {new Date().getFullYear()} Kodely</span>
        </p>
      </div>
    </footer>
  );
}

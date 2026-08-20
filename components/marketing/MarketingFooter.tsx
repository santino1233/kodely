import Link from "next/link";
import { InstagramIcon, FacebookIcon, YoutubeIcon, LinkedinIcon } from "./SocialIcons";
import { Logo } from "./Logo";

const SOCIALS = [
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "Facebook", href: "#", Icon: FacebookIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
  { label: "LinkedIn", href: "#", Icon: LinkedinIcon },
];

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-40"
        style={{ background: "var(--brand-gradient)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 text-sm text-neutral-500 sm:flex-row sm:justify-between dark:text-neutral-500">
        <Link href="/" className="flex items-center gap-2">
          <Logo markSize={18} className="text-sm" />
          <span className="hidden text-neutral-400 sm:inline dark:text-neutral-600">AI websites, simplified.</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/pricing" className="hover:text-neutral-900 dark:hover:text-white">
            Pricing
          </Link>
          <Link href="/blog" className="hover:text-neutral-900 dark:hover:text-white">
            Blog
          </Link>
          <Link href="/login" className="hover:text-neutral-900 dark:hover:text-white">
            Sign in
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {SOCIALS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-700 dark:hover:text-white"
            >
              <Icon size={15} />
            </a>
          ))}
        </div>

        <p className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-600">
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

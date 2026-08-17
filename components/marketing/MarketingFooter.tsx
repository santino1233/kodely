import Link from "next/link";
import { Logo } from "./Logo";

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-40"
        style={{ background: "var(--brand-gradient)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-neutral-500 sm:flex-row sm:justify-between dark:text-neutral-500">
        <Link href="/" className="flex items-center gap-2">
          <Logo markSize={18} className="text-sm" />
          <span className="hidden text-neutral-400 sm:inline dark:text-neutral-600">AI websites, simplified.</span>
        </Link>
        <div className="flex gap-6">
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
        <p className="text-xs text-neutral-400 dark:text-neutral-600">
          © {new Date().getFullYear()} Kodely
        </p>
      </div>
    </footer>
  );
}

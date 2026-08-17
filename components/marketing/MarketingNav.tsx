import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function MarketingNav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/">
        <Wordmark className="text-lg" />
      </Link>
      <nav className="flex items-center gap-6 text-sm">
        <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
          Pricing
        </Link>
        <Link href="/blog" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
          Blog
        </Link>
        <Link href="/login" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Get started
        </Link>
      </nav>
    </header>
  );
}

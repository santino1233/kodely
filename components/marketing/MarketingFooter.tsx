import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-neutral-500 dark:text-neutral-500">
        <Wordmark className="text-base" />
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
      </div>
    </footer>
  );
}

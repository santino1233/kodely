import Link from "next/link";
import { Wordmark } from "@/components/marketing/Wordmark";
import { CREDIT_PACKS } from "@/lib/stripe";
import { SIGNUP_GRANT } from "@/lib/credits";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
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

      <section className="mx-auto max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Pay for what you <span className="brand-gradient-text">build</span>, not a seat.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Credits meter real generation cost, not a guess. A build that fails
          to compile is never charged — you only pay for a working result.
        </p>
      </section>

      {/* Free tier */}
      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Every new account
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {SIGNUP_GRANT} free credits
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enough for a real first site plus a few rounds of changes. No card required.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-block rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Start free
          </Link>
        </div>
      </section>

      {/* Credit packs */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-center text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          Top up anytime
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack, i) => (
            <div
              key={pack.id}
              className={`rounded-2xl border p-7 ${
                i === 1
                  ? "border-neutral-900 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.3)] dark:border-white"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {i === 1 && (
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Most popular
                </p>
              )}
              <p className="text-3xl font-semibold tracking-tight">
                ${(pack.priceUsdCents / 100).toFixed(0)}
              </p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {pack.credits.toLocaleString()} credits
              </p>
              <Link
                href="/signup"
                className={`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-medium ${
                  i === 1
                    ? "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    : "border border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-lg text-center text-sm text-neutral-500 dark:text-neutral-500">
          A typical first build runs roughly 100–150 credits; a follow-up
          change is usually similar. Credits never expire.
        </p>
      </section>

      {/* FAQ-ish clarifications */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="space-y-8">
          <div>
            <h3 className="font-semibold">Why credits instead of a flat monthly price?</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Every generation costs real AI compute. A flat "unlimited" price
              either loses money on heavy users or gets throttled quietly —
              neither is honest. Credits mean the price you see is the price
              you pay, and nothing more.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">What if a build fails?</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              You're not charged. If a generation doesn't produce a working
              result, it costs you nothing — that's a rule enforced in the
              billing code, not just a policy.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Is hosting included?</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Yes. Publishing puts your site on a real *.kodely.site URL at no
              extra cost — no separate hosting bill to think about.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-neutral-500 dark:text-neutral-500">
          <Wordmark className="text-base" />
          <div className="flex gap-6">
            <Link href="/" className="hover:text-neutral-900 dark:hover:text-white">
              Home
            </Link>
            <Link href="/login" className="hover:text-neutral-900 dark:hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { Gift, CheckCircle2 } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/stripe";
import { SIGNUP_GRANT } from "@/lib/credits";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";
import { MagneticButton } from "@/components/marketing/MagneticButton";
import { SkipLink } from "@/components/marketing/SkipLink";

const FAQS = [
  {
    q: "Why credits instead of a flat monthly price?",
    a: "Every generation costs real AI compute. A flat \"unlimited\" price either loses money on heavy users or gets throttled quietly — neither is honest. Credits mean you pay for the generation you actually ran, metered from real usage, and nothing more.",
  },
  {
    q: "What if a build fails?",
    a: "You're not charged. If a generation doesn't produce a working result, it costs you nothing — that's a rule enforced in the billing code, not just a policy.",
  },
  {
    q: "Is hosting included?",
    a: "Yes. Publishing puts your site on a real *.kodely.site URL at no extra cost — no separate hosting bill to think about.",
  },
];

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <SkipLink />
      <Aura />
      <MarketingNav />

      {/* The page had no <main> landmark; this is a wrapper only. */}
      <main id="main-content" tabIndex={-1}>
      <section className="relative mx-auto max-w-4xl px-6 pb-8 pt-40 text-center sm:pt-52">
        <Reveal>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Pay for what you <span className="brand-gradient-text">build</span>, not a seat.
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
            Credits meter real generation cost, not a guess. A build that fails
            to compile is never charged — you only pay for a working result.
          </p>
        </Reveal>
      </section>

      {/* Free tier */}
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Reveal>
          <MotionLift lift={4}>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center transition-shadow hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                <Gift size={17} style={{ color: "var(--accent)" }} />
              </div>
              <p className="mt-4 text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                Every new account
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {SIGNUP_GRANT} free credits
              </p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Enough to build a real first site. No card required.
              </p>
              <MagneticButton className="mt-5">
                <Link
                  href="/signup"
                  className="inline-block rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Start free
                </Link>
              </MagneticButton>
            </div>
          </MotionLift>
        </Reveal>
      </section>

      {/* Credit packs */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Reveal>
          <h2 className="text-center text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Top up anytime
          </h2>
        </Reveal>
        <RevealGroup className="mt-6 grid gap-6 sm:grid-cols-3" stagger={0.08}>
          {CREDIT_PACKS.map((pack, i) => (
            <RevealItem key={pack.id}>
              <MotionLift lift={6} className="h-full">
                <div
                  className="h-full rounded-2xl p-7 transition-shadow hover:shadow-xl"
                  style={
                    i === 1
                      ? {
                          border: "1px solid transparent",
                          backgroundImage:
                            "linear-gradient(var(--panel), var(--panel)), var(--brand-gradient)",
                          backgroundOrigin: "border-box",
                          backgroundClip: "padding-box, border-box",
                          boxShadow: "var(--sh)",
                        }
                      : { border: "1px solid var(--line)" }
                  }
                >
                  {i === 1 && (
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--accent)" }}>
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
                        ? "text-white"
                        : "border border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
                    }`}
                    style={i === 1 ? { background: "var(--brand-gradient)" } : undefined}
                  >
                    Get started
                  </Link>
                </div>
              </MotionLift>
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal delay={0.1}>
          {/* dark:text-neutral-500 was 4.2:1 on the dark page — just under
              AA's 4.5:1 for this size. neutral-400 clears it at 7.9:1. */}
          <p className="mx-auto mt-8 max-w-lg text-center text-sm text-neutral-500 dark:text-neutral-400">
            Credits come off measured model usage once a build succeeds, so
            what a build costs depends on how much work it took. Credits never
            expire.
          </p>
        </Reveal>
      </section>

      {/* FAQ-ish clarifications */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <RevealGroup className="space-y-8" stagger={0.08}>
          {FAQS.map((item) => (
            <RevealItem key={item.q}>
              <div className="flex gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                <div>
                  <h3 className="font-semibold">{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{item.a}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

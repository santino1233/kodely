import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { HeroMock } from "@/components/marketing/HeroMock";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { PinnedStatement } from "@/components/marketing/PinnedStatement";
import { LogoCarousel } from "@/components/marketing/LogoCarousel";
import { PromptHero } from "@/components/marketing/PromptHero";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/Reveal";
import { ShineButton } from "@/components/marketing/ShineButton";
import { TrustBento } from "@/components/marketing/TrustBento";
import { Mark } from "@/components/marketing/Logo";

const PROOF_POINTS = ["Real React app, not HTML", "Live in one click", "Metered by real cost"];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pb-28 pt-40 text-center sm:pt-52">
        <Reveal>
          {/* Deliberately spells out "Kodely" + "AI website builder" as
              literal, prominent, above-the-fold text — Google's OAuth
              consent-screen branding review flagged the home page for not
              clearly naming/explaining the app, and this line is what a
              crawler or reviewer sees first. */}
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
            Kodely — AI website builder
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Build something that didn&apos;t exist{" "}
            <span className="brand-gradient-text">five minutes ago.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
            Kodely is an AI website builder. Describe the site you want, and
            Kodely designs it, builds a real React app, and puts it online —
            at a real, working URL.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-10 flex justify-center">
            <Mark size={34} />
          </div>
          <div className="mt-4">
            <PromptHero />
          </div>
          <p className="mt-5 font-mono text-xs text-neutral-400 dark:text-neutral-600">
            No credit card · Failed builds are free · Real React, not a template
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-block text-xs font-medium text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
          >
            See pricing
          </Link>
        </Reveal>

        <div className="mt-16">
          <HeroMock />
        </div>
      </section>

      {/* Logo strip — the range of businesses Kodely builds for (illustrative
          example brands, not real customers — Kodely has none to name yet) */}
      <section className="border-t border-neutral-100 pb-20 pt-16 dark:border-neutral-900">
        <Reveal>
          <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600">
            The range of sites people build with Kodely
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-8">
            <LogoCarousel />
          </div>
        </Reveal>
      </section>

      {/* Pinned scroll statement */}
      <PinnedStatement />

      {/* Trust — asymmetric bento grid with real, checkable content instead
          of three even icon tiles (see TrustBento for the reasoning) */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <Reveal>
            <h2 className="mx-auto max-w-xl text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Built the way you&apos;d want to check it yourself.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mt-12">
              <TrustBento />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Differentiation — big type statement */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-28 text-center sm:py-36">
          <Reveal>
            <h2 className="text-[clamp(2.2rem,6vw,4.4rem)] font-semibold leading-[1.05] tracking-tight">
              AI writes code.
              <br />
              <span className="brand-gradient-text">Kodely gives you a live business.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
              The model doing the writing is a commodity now — anyone can get code
              out of an AI. What you actually need is a live, hosted, working site
              with a real URL, without becoming the person who has to maintain a
              server to get it. That's the part Kodely does for you.
            </p>
          </Reveal>
          <RevealGroup className="mt-8 flex flex-wrap items-center justify-center gap-3" stagger={0.06}>
            {PROOF_POINTS.map((point) => (
              <RevealItem key={point}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--brand-gradient)" }}
                    aria-hidden
                  />
                  {point}
                </span>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Final CTA — combines what used to be two separate sections (a
          "start free, pay only for what you build" pricing blurb, and a
          "what will you build?" close) into one, so the page doesn't repeat
          itself right before the footer. */}
      <section className="relative overflow-hidden border-t border-neutral-100 dark:border-neutral-900">
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center sm:py-36">
          <Reveal>
            <h2 className="text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[1.05] tracking-tight">
              What will you <span className="brand-gradient-text">build?</span>
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
              750 free credits on signup — enough for a real site and a few
              changes. Pay only for what you build; a failed build is never
              charged.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <ShineButton className="mt-8">
              <Link
                href="/signup"
                className="inline-block rounded-lg px-7 py-3.5 text-sm font-medium text-white shadow-[0_14px_34px_-16px_var(--glow)]"
                style={{ background: "var(--brand-gradient)" }}
              >
                Let&apos;s build it
              </Link>
            </ShineButton>
          </Reveal>
          <Reveal delay={0.16}>
            <Link
              href="/pricing"
              className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
            >
              See full pricing <ArrowRight size={12} />
            </Link>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

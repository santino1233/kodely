import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { HeroMock } from "@/components/marketing/HeroMock";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { PinnedStatement } from "@/components/marketing/PinnedStatement";
import { WhatPeopleBuild } from "@/components/marketing/WhatPeopleBuild";
import { PromptHero } from "@/components/marketing/PromptHero";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/Reveal";
import { MagneticButton } from "@/components/marketing/MagneticButton";

const PROOF_POINTS = ["Real React app, not HTML", "Live in one click", "Metered by real cost"];

const FEATURES = [
  {
    kicker: "Transparency",
    title: "Real code, not a black box.",
    body: "Kodely writes actual React and TypeScript components — open the Code tab any time and read exactly what was generated, line by line.",
    visual: "code" as const,
  },
  {
    kicker: "Trust",
    title: "Secure by default.",
    body: "Every publish is scanned for exposed API keys and secrets before it goes live. The mistakes that leak other people's data never make it out the door.",
    visual: "shield" as const,
  },
  {
    kicker: "Hosting",
    title: "Live in one click.",
    body: "Publishing puts your site on a real, HTTPS-secured *.kodely.site URL immediately — no separate hosting to configure, no DNS to touch.",
    visual: "url" as const,
  },
];

function FeatureVisual({ kind }: { kind: "code" | "shield" | "url" }) {
  if (kind === "code") {
    return (
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 font-mono text-[13px] leading-[1.9] text-neutral-600 shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        <div>
          <span style={{ color: "#a33dff" }}>export default function</span>{" "}
          <span style={{ color: "var(--accent)" }}>Hero</span>() {"{"}
        </div>
        <div>
          &nbsp;&nbsp;<span style={{ color: "#a33dff" }}>return</span> &lt;<span style={{ color: "var(--accent)" }}>section</span>&gt;
        </div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;Small-batch coffee, roasted weekly.</div>
        <div>
          &nbsp;&nbsp;&lt;/<span style={{ color: "var(--accent)" }}>section</span>&gt;
        </div>
        <div>{"}"}</div>
        <div className="mt-2 opacity-50">// real .tsx, visible in the Code tab</div>
      </div>
    );
  }
  if (kind === "shield") {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
        <ShieldCheck size={72} strokeWidth={1.4} style={{ color: "var(--accent)" }} />
      </div>
    );
  }
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-2xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
      <div className="font-mono text-sm text-neutral-400 dark:text-neutral-600">
        roan-coffee<span style={{ color: "var(--accent)" }}>.kodely.site</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        Live · HTTPS
      </div>
    </div>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-28 pt-40 text-center sm:pt-52">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
            AI websites, simplified
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
            Describe the site you want. Kodely designs it, builds a real React
            app, and puts it online — at a real, working URL.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-10">
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

      {/* Showcase — the range of sites Kodely builds (no named customers yet, so no logo cloud) */}
      <section className="border-t border-neutral-100 pb-20 pt-16 dark:border-neutral-900">
        <Reveal>
          <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600">
            What people build with Kodely
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-8">
            <WhatPeopleBuild />
          </div>
        </Reveal>
      </section>

      {/* Pinned scroll statement */}
      <PinnedStatement />

      {/* Features — alternating */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title}>
              <div
                className={`flex flex-col items-center gap-10 py-16 sm:py-20 md:flex-row md:gap-16 ${
                  i % 2 === 1 ? "md:flex-row-reverse" : ""
                }`}
              >
                <div className="flex-1 text-center md:text-left">
                  <span
                    className="font-mono text-xs font-medium uppercase tracking-[0.14em]"
                    style={{ color: "var(--accent)" }}
                  >
                    {f.kicker}
                  </span>
                  <h3 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{f.title}</h3>
                  <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-neutral-600 md:mx-0 dark:text-neutral-400">
                    {f.body}
                  </p>
                </div>
                <div className="w-full flex-1">
                  <FeatureVisual kind={f.visual} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Differentiation — big type statement */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
          <Reveal>
            <h2 className="text-[clamp(2.2rem,6vw,4.4rem)] font-semibold leading-[1.05] tracking-tight">
              Claude writes code.
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

      {/* Pricing preview */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Start free. Pay only for what you build.
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
              750 free credits on signup — enough for a real site and a few
              changes. A build that fails is never charged.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 underline underline-offset-4 dark:text-white"
            >
              See full pricing <ArrowRight size={14} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-neutral-100 dark:border-neutral-900">
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center sm:py-36">
          <Reveal>
            <h2 className="text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[1.05] tracking-tight">
              What will you <span className="brand-gradient-text">build?</span>
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mt-5 text-base text-neutral-600 dark:text-neutral-400">
              Your next site is one sentence away.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <MagneticButton className="mt-8">
              <Link
                href="/signup"
                className="inline-block rounded-lg px-7 py-3.5 text-sm font-medium text-white shadow-[0_14px_34px_-16px_var(--glow)]"
                style={{ background: "var(--brand-gradient)" }}
              >
                Start building — free
              </Link>
            </MagneticButton>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

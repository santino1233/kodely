import type { Metadata } from "next";
import { FileText, Link2, SquareDashed } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";
import { SkipLink } from "@/components/marketing/SkipLink";
import { TemplateGallery } from "@/components/templates/TemplateGallery";

export const metadata: Metadata = {
  title: "Templates — Kodely",
  description:
    "Start from a ready-made prompt. Restaurants, portfolios, tradespeople, SaaS landing pages and more — each one a complete, editable brief that builds a real site.",
};

// getCurrentUser() reads the session cookie, so this page can never be
// statically rendered anyway — being explicit keeps that intentional.
export const dynamic = "force-dynamic";

// The three honest limits that apply to EVERY template, stated once and up
// front rather than buried in small print. They are not caveats bolted on
// afterwards: they are what a generated site is (see lib/agent.ts).
const GROUND_RULES = [
  {
    icon: FileText,
    title: "One page, no backend",
    body: "Every build is a single React page. No accounts, no database, no second page to get lost in.",
  },
  {
    icon: Link2,
    title: "Real links, not fake forms",
    body: "Contact, booking and payment go out via email, phone or a link to the service you already use — nothing pretends to work.",
  },
  {
    icon: SquareDashed,
    title: "Your facts stay bracketed",
    body: "Prices, hours and addresses arrive as [placeholders] for you to fill in. Kodely never invents details about your business.",
  },
];

export default async function TemplatesPage() {
  const user = await getCurrentUser();

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <SkipLink />
      <Aura />
      <MarketingNav signedIn={Boolean(user)} />

      <main id="main-content" tabIndex={-1}>
        <section className="relative mx-auto max-w-4xl px-6 pb-8 pt-40 text-center sm:pt-52">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              Templates
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Skip the <span className="brand-gradient-text">blank page.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
              {TEMPLATES.length} starting prompts, written the way an expert user would write
              them. Pick one, fill in the bracketed details if you like, and Kodely builds it.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-8">
          <Reveal>
            <ul className="grid gap-4 sm:grid-cols-3">
              {GROUND_RULES.map((rule) => (
                <li
                  key={rule.title}
                  className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
                >
                  <rule.icon size={17} aria-hidden style={{ color: "var(--accent)" }} />
                  <h2 className="mt-3 text-sm font-semibold tracking-tight">{rule.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {rule.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24 pt-8">
          <TemplateGallery templates={TEMPLATES} signedIn={Boolean(user)} />
        </section>
      </main>

      <MarketingFooter signedIn={Boolean(user)} />
    </div>
  );
}

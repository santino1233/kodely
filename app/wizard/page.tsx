import type { Metadata } from "next";
import Link from "next/link";
import { Palette, PenLine, Wand2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { estimateCredits } from "@/lib/credits";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";
import { SkipLink } from "@/components/marketing/SkipLink";
import { PromptWizard } from "@/components/wizard/PromptWizard";
// Read on the server so the wizard never renders a URL field the API would
// refuse. Defaults to false; see app/api/import/fetcher.ts for why the switch
// is named after the egress service rather than after the feature.
import { isUrlImportConfigured } from "@/app/api/import/fetcher";

export const metadata: Metadata = {
  title: "Not sure what to write? — Kodely",
  description:
    "Answer a few quick questions and Kodely assembles a proper build prompt for you — a real brief you can read and edit, with exact colours instead of vague adjectives. No account needed to try it.",
};

// getCurrentUser() reads the session cookie, so this page can never be
// statically rendered — being explicit keeps that intentional.
export const dynamic = "force-dynamic";

// What the wizard promises, stated before anyone answers anything. Each line is
// a real property of the implementation, not a marketing claim: assembly is
// local string work in lib/wizard.ts, the palettes are presets out of
// lib/assets/patterns.ts with their hexes carried into the prompt verbatim, and
// the output is text in a textarea rather than a hidden config.
const PROMISES = [
  {
    icon: PenLine,
    title: "You get a prompt, not a black box",
    body: "The wizard writes plain English into an editable box. Delete the half you disagree with — there are no hidden settings behind it.",
  },
  {
    icon: Palette,
    title: "Real colours, not adjectives",
    body: "Pick a direction and your build gets those exact hex values from Kodely's asset catalogue. “Warm and modern” is how every site ends up looking the same.",
  },
  {
    icon: Wand2,
    title: "Nothing runs until you say so",
    body: "Every answer is assembled in your browser. No account, no AI call, no credits spent until you press Build.",
  },
];

export default async function WizardPage() {
  const user = await getCurrentUser();
  const creditEstimate = estimateCredits("create");

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <SkipLink />
      <Aura />
      <MarketingNav signedIn={Boolean(user)} />

      <main id="main-content" tabIndex={-1}>
        <section className="relative mx-auto max-w-4xl px-6 pb-8 pt-40 text-center sm:pt-52">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              Prompt wizard
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Not sure what to <span className="brand-gradient-text">write?</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
              Three questions, all skippable, and you leave with a proper brief. If you already
              know what you want,{" "}
              <Link
                href="/"
                className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
              >
                the plain box
              </Link>{" "}
              is faster and always will be.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-8">
          <Reveal>
            <ul className="grid gap-4 sm:grid-cols-3">
              {PROMISES.map((promise) => (
                <li
                  key={promise.title}
                  className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
                >
                  <promise.icon size={17} aria-hidden style={{ color: "var(--accent)" }} />
                  <h2 className="mt-3 text-sm font-semibold tracking-tight">{promise.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {promise.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24 pt-8">
          <PromptWizard
            signedIn={Boolean(user)}
            creditEstimate={creditEstimate}
            urlImport={isUrlImportConfigured()}
          />
        </section>
      </main>

      <MarketingFooter signedIn={Boolean(user)} />
    </div>
  );
}

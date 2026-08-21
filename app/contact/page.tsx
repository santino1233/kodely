import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = { title: "Contact — Kodely" };

export default function ContactPage() {
  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      <main className="relative mx-auto max-w-xl px-6 pb-24 pt-36 sm:pt-44">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Get in touch
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Contact us</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            Questions, feedback, or something broken — send it our way and we&apos;ll reply to the
            address you leave below.
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <ContactForm />
        </Reveal>
      </main>

      <MarketingFooter />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Wordmark } from "@/components/marketing/Wordmark";
import { HeroMock } from "@/components/marketing/HeroMock";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark className="text-lg" />
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
            Pricing
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

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-28 text-center sm:pt-24">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          AI websites, simplified
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Describe your site.{" "}
          <span className="brand-gradient-text">Watch it get built.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Kodely turns a plain-English description into a real React app — then
          puts it live on the internet with one click.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Start building — free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-neutral-200 px-6 py-3 text-sm font-medium text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
          >
            See pricing
          </Link>
        </div>

        <div className="mt-16">
          <HeroMock />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-12 sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Describe it",
                body: "Tell Kodely what you want in plain language — the audience, the tone, what it needs to do.",
              },
              {
                n: "02",
                title: "Watch it build",
                body: "A real Vite + React + TypeScript app takes shape live in the preview, not a static mockup.",
              },
              {
                n: "03",
                title: "Ship it",
                body: "One click publishes to a real, public URL. No hosting to configure, nothing to deploy yourself.",
              },
            ].map((step) => (
              <div key={step.n}>
                <div className="text-sm font-medium text-neutral-400 dark:text-neutral-600">{step.n}</div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Differentiation */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Claude writes code.
            <br />
            <span className="brand-gradient-text">Kodely gives you a live business.</span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
            The model doing the writing is a commodity now — anyone can get code
            out of an AI. What you actually need is a live, hosted, working site
            with a real URL, without becoming the person who has to maintain a
            server to get it. That's the part Kodely does for you.
          </p>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Start free. Pay only for what you build.
          </h2>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
            750 free credits on signup — enough for a real site and a few
            changes. A build that fails is never charged.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-block text-sm font-medium text-neutral-900 underline underline-offset-4 dark:text-white"
          >
            See full pricing →
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Describe it. Generate it. Ship it.
          </h2>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Start building — free
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-100 px-6 py-10 dark:border-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-neutral-500 dark:text-neutral-500">
          <Wordmark className="text-base" />
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-neutral-900 dark:hover:text-white">
              Pricing
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

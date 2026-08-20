import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = { title: "Privacy Policy — Kodely" };

const UPDATED = "August 20, 2026";

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      <article className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 sm:pt-44">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">Last updated {UPDATED}</p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="article-body mt-10">
            <p>
              This policy explains what Kodely (&ldquo;Kodely,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects when
              you use kodely.me and the apps you build with it, why we collect it, and the choices you have.
            </p>

            <h2>Information we collect</h2>
            <ul>
              <li>
                <strong>Account information.</strong> Your email address, and either a password (stored as a salted
                hash — we never see or store your plaintext password) or, if you sign in with Google, your name and
                Google account identifier.
              </li>
              <li>
                <strong>Project content.</strong> The prompts you write, the files Kodely generates for your
                projects, and your build/edit history — this is the substance of the product and is stored so your
                projects persist and can be edited or rolled back.
              </li>
              <li>
                <strong>Usage and billing data.</strong> Credit balance and ledger entries, generation token counts,
                and (if you purchase credits) billing metadata handled by our payment processor, Stripe — we do not
                store your card number.
              </li>
              <li>
                <strong>Technical data.</strong> Session cookies used to keep you signed in, and basic request logs
                (IP address, timestamps) kept for security and abuse prevention.
              </li>
            </ul>

            <h2>How we use it</h2>
            <p>
              To operate your account and projects, to generate and repair the sites you ask for, to meter and bill
              usage accurately, to keep the service secure and prevent abuse, and to communicate with you about your
              account. We do not sell your personal information, and we do not run third-party advertising trackers
              on kodely.me.
            </p>

            <h2>Who we share it with</h2>
            <p>Kodely uses a small number of service providers to operate the product:</p>
            <ul>
              <li>
                <strong>Anthropic</strong> processes the prompts and project context needed to generate and edit your
                site&apos;s code. Prompts and file contents are sent to Anthropic&apos;s API for this purpose.
              </li>
              <li>
                <strong>Stripe</strong> processes credit purchases, when enabled. Stripe receives what it needs to
                process a payment; we receive confirmation of the payment, not your card details.
              </li>
              <li>
                <strong>Google</strong> is used only if you choose &ldquo;Sign in with Google&rdquo; — we receive your
                name, email, and a Google account identifier to create or match your account.
              </li>
            </ul>
            <p>We do not otherwise sell, rent, or share your personal data with third parties.</p>

            <h2>Published sites</h2>
            <p>
              When you publish a project, the generated site becomes publicly reachable at its{" "}
              <code>*.kodely.site</code> URL — anyone with the link can view it. Don&apos;t publish content you don&apos;t
              want to be public. Every publish is scanned for accidentally-included secrets (API keys, tokens) before
              it goes live.
            </p>

            <h2>Data retention and deletion</h2>
            <p>
              We keep your account and project data for as long as your account is active. You can delete individual
              projects from your dashboard at any time. To delete your account and associated data entirely, contact
              us at the address below.
            </p>

            <h2>Your rights</h2>
            <p>
              Depending on where you live, you may have the right to access, correct, export, or delete your personal
              data, and to object to or restrict certain processing. Contact us to exercise any of these rights.
            </p>

            <h2>Children</h2>
            <p>Kodely is not directed at children under 16, and we do not knowingly collect their data.</p>

            <h2>Changes to this policy</h2>
            <p>
              If we make material changes, we&apos;ll update the date at the top of this page and, where appropriate,
              notify you directly.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about this policy or your data — <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
            </p>
          </div>
        </Reveal>
      </article>

      <MarketingFooter />
    </div>
  );
}

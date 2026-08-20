import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = { title: "Terms of Service — Kodely" };

const UPDATED = "August 20, 2026";

export default function TermsPage() {
  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      <article className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 sm:pt-44">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">Last updated {UPDATED}</p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="article-body mt-10">
            <p>
              These terms govern your use of Kodely (kodely.me and the projects you build with it). By creating an
              account, you agree to them.
            </p>

            <h2>The service</h2>
            <p>
              Kodely turns a written description into a real React application, lets you iterate on it by
              describing changes, and can publish it to a <code>*.kodely.site</code> URL. It is provided
              &ldquo;as is&rdquo; — we work to keep it reliable, but we don&apos;t guarantee uninterrupted
              availability.
            </p>

            <h2>Your account</h2>
            <p>
              You&apos;re responsible for the activity on your account and for keeping your credentials secure. You
              must provide an accurate email address and be able to receive mail there for account and security
              notices.
            </p>

            <h2>Credits and billing</h2>
            <ul>
              <li>New accounts receive a starting grant of free credits.</li>
              <li>Generations are metered against your credit balance based on actual model usage.</li>
              <li>
                <strong>A build that fails to produce a working result is never charged</strong> — that includes
                generations that error out or that you cancel before they finish.
              </li>
              <li>Additional credits, where purchasable, are processed through Stripe and are generally non-refundable once granted, except where required by law.</li>
            </ul>

            <h2>Acceptable use</h2>
            <p>You agree not to use Kodely to:</p>
            <ul>
              <li>Generate or publish content that is illegal, fraudulent, or infringes someone else&apos;s rights.</li>
              <li>Generate or publish malware, phishing pages, or anything designed to deceive or harm visitors.</li>
              <li>Attempt to circumvent rate limits, credit metering, or the sandboxing that isolates generated sites.</li>
              <li>Use the service to build a competing AI website builder by systematically extracting our prompts or infrastructure.</li>
            </ul>
            <p>We may suspend or terminate accounts that violate these terms.</p>

            <h2>Ownership of what you build</h2>
            <p>
              You own the content and design of the sites you generate with Kodely — the specific text, layout, and
              customizations that came from your prompts. Kodely retains ownership of the underlying platform,
              templates, foundation code, and infrastructure that make generation possible. Publishing a project
              through Kodely does not transfer ownership of Kodely&apos;s own software to you.
            </p>

            <h2>Published sites are your responsibility</h2>
            <p>
              You&apos;re responsible for the content of anything you publish. We scan published output for obviously
              exposed secrets as a courtesy safeguard, but that scan isn&apos;t a substitute for reviewing your own
              site before it goes live.
            </p>

            <h2>Disclaimer and limitation of liability</h2>
            <p>
              Kodely is provided without warranties of any kind, express or implied. To the maximum extent permitted
              by law, Kodely is not liable for indirect, incidental, or consequential damages arising from your use
              of the service. Our total liability for any claim is limited to the amount you paid us in the twelve
              months before the claim arose.
            </p>

            <h2>Changes to these terms</h2>
            <p>
              We may update these terms as the product evolves. Material changes will be reflected by updating the
              date at the top of this page.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about these terms — <a href="mailto:hello@kodely.me">hello@kodely.me</a>.
            </p>
          </div>
        </Reveal>
      </article>

      <MarketingFooter />
    </div>
  );
}

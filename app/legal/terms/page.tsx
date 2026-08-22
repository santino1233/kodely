import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = { title: "Terms of Service — Kodely" };

const UPDATED = "August 22, 2026";

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
              These terms govern your use of Kodely (kodely.me and the projects you build with it). By creating
              an account, you agree to them. Kodely is operated by{" "}
              <strong>[OPERATING ENTITY AND REGISTERED ADDRESS — TO BE CONFIRMED]</strong>.
            </p>

            <h2>The service</h2>
            <p>
              Kodely turns a written description into a real React application, lets you iterate on it by
              describing changes, and can publish it to a <code>*.kodely.site</code> URL. It is provided
              &ldquo;as is&rdquo; — we work to keep it reliable, but we don&apos;t guarantee uninterrupted
              availability.
            </p>
            <p>
              What Kodely builds is a <strong>front-end site</strong>: layout, sections, copy and visual style,
              compiled to static files and served under a policy that blocks external hosts. There is no backend.
              A contact form, a checkout or a booking button can exist as a visual element on the page, but
              nothing on a published site stores a record, sends an email, takes a payment, or signs anyone in.
              Please don&apos;t promise your own visitors otherwise.
            </p>

            <h2>Your account</h2>
            <p>
              You&apos;re responsible for the activity on your account and for keeping your credentials secure.
              You must provide an accurate email address and be able to receive mail there for account and
              security notices. One person, one account — creating extra accounts to collect starting credits or
              reward credits again is a breach of these terms.
            </p>

            <h2>Credits and billing</h2>
            <ul>
              <li>
                New accounts receive a starting grant of free credits, no card required. The current amount is
                shown on the pricing and sign-up pages.
              </li>
              <li>
                A credit is a fixed, published amount of underlying model spend — not a mystery unit. The current
                rate is on the pricing page.
              </li>
              <li>
                Generations are metered against your credit balance from the tokens a build actually used, after
                it finishes. We never charge a flat guess up front.
              </li>
              <li>
                <strong>A build that fails to produce a working result is never charged</strong> — that includes
                generations that error out, that never produce a compiling site, and ones you cancel or abandon
                before they finish.
              </li>
              <li>
                If a build doesn&apos;t compile the first time, Kodely repairs it and tries again. The repair
                attempt is never charged: a run that succeeds after a repair costs the same as if it had compiled
                first time. We don&apos;t bill you for our own mistake.
              </li>
              <li>
                Expanding a prompt with <strong>Enhance</strong>, and rating a build, are free. A preview of what
                you are about to buy shouldn&apos;t itself cost anything.
              </li>
              <li>
                You can set your own ceiling on credits spent per rolling 30 days in Settings. When you reach it,
                generation stops until you raise or remove it. It is your cap, not a plan limit, and it does not
                remove or refund credits.
              </li>
              <li>
                Cost estimates shown before a build are ranges based on past builds, not quotes. The amount
                charged is the metered one.
              </li>
              <li>
                Additional credits, where purchasable, are processed through Stripe and are generally
                non-refundable once granted, except where required by law.
              </li>
            </ul>

            <h2>Reward credits</h2>
            <p>
              We sometimes offer free credits for connecting a social account. Because those credits are real
              money, the rules are strict, and by claiming one you accept them:
            </p>
            <ul>
              <li>Each reward can be granted once per Kodely account, and once per external account, ever.</li>
              <li>Rewards unlock a day after sign-up, not immediately.</li>
              <li>
                Where we can&apos;t verify a claim with the platform itself, the claim is recorded and held for a
                few days before it pays out.
              </li>
              <li>
                We may withhold, delay or reverse reward credits where we see signs of farming or abuse, and we
                may withdraw the programme at any time.
              </li>
            </ul>

            <h2>Acceptable use</h2>
            <p>You agree not to use Kodely to:</p>
            <ul>
              <li>Generate or publish content that is illegal, fraudulent, or infringes someone else&apos;s rights.</li>
              <li>
                Build a sign-in page dressed up as another company&apos;s service, or any page that asks visitors
                to &ldquo;verify,&rdquo; &ldquo;confirm&rdquo; or re-enter credentials for an account they hold
                somewhere else.
              </li>
              <li>
                Collect credentials or personal details and route them to a drop channel — a messaging-bot
                endpoint, a webhook, or a collector on someone else&apos;s server.
              </li>
              <li>
                Ask visitors for a crypto wallet&apos;s seed phrase, recovery phrase or private key, or connect a
                visitor&apos;s wallet and then request permission to move assets it doesn&apos;t own.
              </li>
              <li>Publish malware, obfuscated payloads that assemble and run hidden code, or anything else designed to deceive or harm visitors.</li>
              <li>Attempt to circumvent rate limits, credit metering, the publish checks, or the sandboxing that isolates generated sites.</li>
              <li>Use the service to build a competing AI website builder by systematically extracting our prompts or infrastructure.</li>
            </ul>
            <p>
              We may suspend or terminate accounts that violate these terms, and we may take a published site
              offline.
            </p>

            <h2>Limits on use</h2>
            <p>
              To keep the service and the sites we host healthy, we apply rate limits — on how many generations
              you can run in an hour, how many prompt expansions you can request, and how many brand-new
              subdomains you can publish in a day. Iterating on a site you already published isn&apos;t affected.
              These limits are safety nets and may change.
            </p>

            <h2>Ownership of what you build</h2>
            <p>
              You own the content and design of the sites you generate with Kodely — the specific text, layout,
              and customizations that came from your prompts. Kodely retains ownership of the underlying
              platform, templates, foundation code, and infrastructure that make generation possible. Publishing
              a project through Kodely does not transfer ownership of Kodely&apos;s own software to you.
            </p>
            <p>
              You can download any project&apos;s source as a zip at any time, and take it elsewhere. AI-generated
              output may resemble output produced for someone else; we can&apos;t and don&apos;t warrant that what
              is generated is unique or free of third-party rights.
            </p>

            <h2>Published sites are your responsibility</h2>
            <p>
              You&apos;re responsible for the content of anything you publish. Before a publish goes live we scan
              the files for obviously exposed secrets and for a small set of concrete abuse patterns, and we
              refuse to publish the clearest of those. Those checks are pattern-matching, not review: they miss
              things, they can be evaded deliberately, and a clean result means &ldquo;nothing obvious was
              found,&rdquo; not that your site has been approved. Review your own site before it goes live.
            </p>
            <p>
              Deleting a project is how you withdraw a published site. It takes the site offline immediately,
              though an already-cached page may survive briefly at the CDN or in a visitor&apos;s browser.
            </p>

            <h2>Privacy</h2>
            <p>
              What we collect and why is set out in our <Link href="/legal/privacy">Privacy Policy</Link>. Note in
              particular that your prompts and project files are sent to Anthropic to generate your site.
            </p>

            <h2>Disclaimer and limitation of liability</h2>
            <p>
              Kodely is provided without warranties of any kind, express or implied. To the maximum extent
              permitted by law, Kodely is not liable for indirect, incidental, or consequential damages arising
              from your use of the service. Our total liability for any claim is limited to the amount you paid
              us in the twelve months before the claim arose.
            </p>

            <h2>Governing law</h2>
            <p>
              These terms are governed by <strong>[GOVERNING LAW AND JURISDICTION — TO BE CONFIRMED]</strong>.
            </p>

            <h2>Changes to these terms</h2>
            <p>
              We may update these terms as the product evolves. Material changes will be reflected by updating
              the date at the top of this page.
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

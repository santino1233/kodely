import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = { title: "Privacy Policy — Kodely" };

const UPDATED = "August 22, 2026";

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
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">The short version</h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Plain English. The full detail is below, and this summary doesn&apos;t replace it.
            </p>
            <div className="article-body mt-5">
              <ul>
                <li>
                  We store what you&apos;d expect: your email, your projects, the prompts you write, and the
                  files Kodely generates from them.
                </li>
                <li>
                  Your prompts and your project&apos;s files go to Anthropic, the company whose AI model
                  actually writes your site. That is the only place your project content is sent.
                </li>
                <li>
                  We keep our own product analytics — a list of things that happened, like &ldquo;build
                  started,&rdquo; &ldquo;build succeeded,&rdquo; &ldquo;site published.&rdquo; It runs on our own
                  servers. There is no Google Analytics, no advertising pixel and no third-party tracker on
                  kodely.me.
                </li>
                <li>
                  Those analytics records never contain the text of your prompts or any generated code. When
                  you ask for a change after a build, we save a one-word guess at the category — &ldquo;visual,&rdquo;
                  &ldquo;layout,&rdquo; &ldquo;broken&rdquo; — and not what you typed.
                </li>
                <li>
                  If you give a build a thumbs up or thumbs down, we record that rating and, if you pick one,
                  the reason from a short fixed list.
                </li>
                <li>
                  Publishing puts your site on the public internet. Before it goes live we scan it for
                  accidentally-included secrets and for phishing and crypto-drainer patterns, and we refuse to
                  publish the worst of those.
                </li>
                <li>
                  You can download any project as a zip whenever you like, and download everything we hold
                  about your account as one JSON file from{" "}
                  <Link href="/legal/rights">Your data and your rights</Link>.
                </li>
                <li>We don&apos;t sell your personal information.</li>
                <li>
                  Nothing is deleted on a timer. Your projects, builds and analytics records stay until you
                  delete the project or delete your account — which you can now do yourself, with a seven-day
                  wait and a second confirmation before anything is destroyed.
                </li>
                <li>
                  Three cookies, all strictly necessary, no trackers — which is why there is no cookie banner.
                  The whole list is on <Link href="/legal/rights">Your data and your rights</Link>.
                </li>
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="article-body mt-12">
            <p>
              This policy explains what Kodely (&ldquo;Kodely,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects
              when you use kodely.me and the sites you build with it, why we collect it, how long we keep it,
              and the choices you have.
            </p>
            <p>
              Kodely is operated by <strong>[OPERATING ENTITY AND REGISTERED ADDRESS — TO BE CONFIRMED]</strong>.
              You can reach us about anything on this page at{" "}
              <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
            </p>

            <h2>What we collect</h2>

            <h3>Account information</h3>
            <p>
              Your email address, and either a password (stored as a salted scrypt hash — we never see or store
              your plaintext password) or, if you sign in with Google, your name and your Google account
              identifier. If you set a monthly spending cap, we store that number. If you buy credits, we store
              the customer identifier our payment processor gives us.
            </p>

            <h3>Project content</h3>
            <p>
              The project names and URL slugs you choose, the prompts you write, Kodely&apos;s replies, the
              source files it generates, and the compiled output of each build. This is the substance of the
              product: it is stored so your projects persist and can be edited, previewed, published and rolled
              back. If you attach a reference image to a prompt, it is sent to the model for that build but is
              not saved to your project.
            </p>
            <p>
              A prompt you type on the homepage before you have an account stays in your own browser until you
              sign in and a project is created for it.
            </p>

            <h3>Build records</h3>
            <p>
              For every generation we record the prompt, which model ran, token counts, the computed cost, the
              credits charged, how many repair attempts the build needed, any error message, and — after a
              successful build — a full snapshot of your project&apos;s files at that moment. The snapshot is
              what makes rolling a project back to an earlier build possible.
            </p>

            <h3>Credits ledger</h3>
            <p>
              Every credit grant and charge, with the reason, the related build, and the resulting balance. The
              ledger is append-only, because a balance you can&apos;t audit is a balance you can&apos;t trust.
            </p>

            <h3>Product analytics</h3>
            <p>
              We keep a first-party event stream on our own infrastructure — no third-party analytics service is
              involved. Each record is an event name, your user id, a timestamp, and a small set of properties.
              The events we record today are: sign-up (and whether it was by password or Google), project
              created, project deleted, build started, build succeeded, build failed, build rated, site
              published, credits exhausted, self-imposed spending cap reached, checkout started, and
              credits purchased.
            </p>
            <p>The properties stored alongside them are small and non-identifying by design — things like:</p>
            <ul>
              <li>project, build and site-slug identifiers, so a funnel can follow one journey;</li>
              <li>counts and outcomes: files written, credits charged, remaining balance, repair attempts, the model name, whether a build was a first build or an edit, whether a publish was the first for that project, why a build failed;</li>
              <li>
                for an edit, a single coarse <strong>intent bucket</strong> guessed from your follow-up request by a
                keyword rule — one of <code>broken</code>, <code>visual</code>, <code>content</code>,{" "}
                <code>layout</code>, <code>add</code>, <code>remove</code>, <code>praise</code> or{" "}
                <code>other</code>. Only the bucket is stored. The text you wrote is not copied into this record.
              </li>
            </ul>
            <p>
              We deliberately do not put prompt text, generated code, file contents or email addresses into this
              stream. It exists to tell us where the product fails people, not to be a second copy of your work.
            </p>

            <h3>Build ratings</h3>
            <p>
              If you rate a finished build, we record the thumbs up or down against that build, along with the
              model and repair count, and — if you choose one — a reason from a fixed list (for example
              &ldquo;looks generic&rdquo; or &ldquo;layout off&rdquo;). Rating a build is optional and costs no
              credits.
            </p>

            <h3>Social reward connections</h3>
            <p>
              If you claim free credits for connecting a social account, what we keep is deliberately minimal:
            </p>
            <ul>
              <li>
                <strong>Discord.</strong> You authorise Kodely through Discord, and we ask Discord for your
                account id and whether you are a member of our server. The access token is used once and never
                stored. What we keep is a keyed hash (an HMAC) of your Discord user id — not the id itself, not
                your username.
              </li>
              <li>
                <strong>Instagram, Facebook, LinkedIn.</strong> You type your username; we store only a keyed
                hash of it. The username itself is not saved, and we do not contact those platforms.
              </li>
            </ul>
            <p>
              The hash exists for one purpose: making sure the same external account can&apos;t collect the same
              reward twice. Because it is keyed with a server-side secret, it can&apos;t be reversed by guessing
              handles.
            </p>

            <h3>Cookies</h3>
            <p>
              Kodely sets five cookies, and every one of them is strictly necessary:
            </p>
            <ul>
              <li>
                <code>kodely_session</code> keeps you signed in for up to 30 days. It holds a random token,
                and the corresponding record in our database holds only a hash of it, so a database read never
                yields a usable cookie.
              </li>
              <li>
                <code>kodely_auth</code> records nothing except <em>that</em> you are signed in — its only
                value is the digit <code>1</code>. It carries no name, no email address and no part of the
                token above. It exists so a page served from cache, which cannot know who is asking for it,
                can still show you &ldquo;Portal&rdquo; rather than &ldquo;Sign in&rdquo;. It is written and
                removed at exactly the same moments as the session cookie, and on its own it grants access to
                nothing.
              </li>
              <li>
                <code>kodely_google_oauth_state</code> is set only when you click &ldquo;Sign in with
                Google&rdquo;, lives ten minutes, and exists to prove the reply from Google answers your own
                request rather than someone else&apos;s forgery.
              </li>
              <li>
                <code>kodely_discord_reward_state</code> does the same job, only when you choose to connect a
                Discord account for reward credits.
              </li>
              <li>
                <code>kodely_nxeon_sso_state</code> does the same job again, only when you choose to connect a
                Nxeon account for domains, VPS or hosting.
              </li>
            </ul>
            <p>
              There is no advertising pixel, no third-party analytics cookie and no tracker that follows you
              to another site — which is why you are not shown a cookie banner. The full reasoning, and what
              your browser stores locally, is on{" "}
              <Link href="/legal/rights">Your data and your rights</Link>.
            </p>

            <h3>Support tickets</h3>
            <p>
              If you open a ticket from the support page inside your account, we store its subject, the
              category you chose, the site you attached if you attached one, its status, and every message on
              the thread — both what you write and what we reply. Unlike the contact form below, these are
              held in the product database, because the thread <em>is</em> the mechanism: it is where you read
              the reply and where you answer back. Whoever answers is recorded on their own message for our
              records; you are shown &ldquo;Kodely support&rdquo; rather than an individual&apos;s address.
            </p>
            <p>
              Separately, support staff can write internal notes about an account so the next person picking
              up a thread has the history. Those are never shown to you inside the product, but they are
              disclosed in full — text and date — if you ask for your data.
            </p>

            <h3>Nxeon (domains, VPS and shared hosting)</h3>
            <p>
              Nxeon is a separate company with its own product and its own login — connecting an account is
              optional and only happens if you choose to buy a domain, a VPS or shared hosting. If you connect
              one, we send Nxeon your Kodely account id so it can hand back the matching Nxeon identity; we do
              not send your email, name or anything else about you to start that link. What we store afterwards
              is the linked Nxeon account id and whatever it later tells us was provisioned — a domain name and
              its renewal date, a server&apos;s address, or a hosting account id — so this page can show you
              what you have. We never see your Nxeon password, and Nxeon billing is entirely between you and
              Nxeon; it does not pass through Kodely credits.
            </p>

            <h3>Technical data</h3>
            <p>
              Requests to kodely.me pass through a CDN and web servers that keep standard access logs, which
              include IP addresses and timestamps. Our contact form holds the sender IP in memory for up to an
              hour purely to rate-limit spam; it is not written to the database.
            </p>

            <h3>If you email us through the contact form</h3>
            <p>
              The name, email address and message you submit are emailed to our own inbox so we can reply. They
              are not stored in the product database. This is the public form on{" "}
              <Link href="/contact">/contact</Link>, and it is a different thing from a support ticket — a
              ticket is stored, has a status, and can be read back later; an emailed message is not and cannot.
            </p>

            <h2>How we use it</h2>
            <p>
              To operate your account and projects; to generate, compile and repair the sites you ask for; to
              meter credits accurately and honour the spending cap you set; to keep the service and the sites we
              host secure and free of abuse; to understand where the product is failing people, using the
              analytics above; and to reply when you contact us. We do not sell your personal information, and
              we do not run third-party advertising or analytics trackers on kodely.me.
            </p>

            <h2>Who we share it with</h2>
            <p>Kodely uses a small number of service providers to operate the product:</p>
            <ul>
              <li>
                <strong>Anthropic</strong> processes the prompts, project files and any reference image needed to
                generate and edit your site&apos;s code, and to expand a rough prompt into a brief when you use
                Enhance. This is the only third party your project content is sent to.
              </li>
              <li>
                <strong>Stripe</strong> processes credit purchases, when enabled. Stripe receives your email
                address and an internal Kodely account identifier so a payment can be matched back to your
                balance. We receive confirmation of the payment; we never see or store your card number.
              </li>
              <li>
                <strong>Google</strong> is used only if you choose &ldquo;Sign in with Google&rdquo; — we receive
                your name, email address and a Google account identifier to create or match your account.
              </li>
              <li>
                <strong>Discord</strong> is contacted only if you choose to connect a Discord account for reward
                credits, and only to confirm your account id and server membership.
              </li>
              <li>
                <strong>Our mail server</strong> delivers contact-form messages and account mail. Kodely sends
                through the mail host that already handles kodely.me&apos;s email rather than a third-party
                sending service.
              </li>
              <li>
                <strong>Our hosting and CDN providers</strong> necessarily handle traffic to kodely.me and to
                published <code>*.kodely.site</code> sites in the course of serving them.
              </li>
            </ul>
            <p>
              We may also disclose data where we are legally required to, or where it is necessary to
              investigate abuse of the service. We do not otherwise sell, rent, or share your personal data with
              third parties.
            </p>

            <h2>Published sites</h2>
            <p>
              When you publish a project, the generated site becomes publicly reachable at its{" "}
              <code>*.kodely.site</code> URL — anyone with the link can view it. Don&apos;t publish content you
              don&apos;t want to be public.
            </p>
            <p>Two automated checks run over the files before a publish goes live:</p>
            <ul>
              <li>
                a scan for accidentally-included secrets such as API keys and tokens, which blocks the publish if
                it finds one;
              </li>
              <li>
                an abuse scan for a small set of concrete patterns — a login form dressed up as another
                company&apos;s, credentials being posted to a known drop channel, a form asking for a crypto
                wallet&apos;s recovery phrase, or a page that connects a wallet and then asks for permission to
                move assets. The clearest of these block the publish; weaker signals are written to our server
                logs so a site can be reviewed if it is ever reported.
              </li>
            </ul>
            <p>
              These checks are pattern-matching, not human review and not a guarantee. A clean result means
              &ldquo;nothing obvious was found,&rdquo; not &ldquo;reviewed and safe.&rdquo; What you publish
              remains your responsibility.
            </p>
            <p>
              Sites we serve — both the in-editor preview and published sites — run under a content security
              policy that blocks every external host, so a generated page cannot load a third-party script,
              font, image or tracker, and cannot call out to another server.
            </p>

            <h2>How long we keep it</h2>
            <p>
              We want to be straightforward here rather than quote a number nothing enforces. Kodely does not
              run any automatic deletion job. In practice:
            </p>
            <ul>
              <li>
                <strong>Projects, files, chat messages and build records</strong> are kept until you delete the
                project. Deleting a project removes its files, messages and builds — including the file
                snapshots — and takes any published site offline. A cached copy of a published page can survive
                at the CDN or in a visitor&apos;s browser for up to a minute after that.
              </li>
              <li>
                <strong>Credit ledger entries survive project deletion</strong>, with the reference to the deleted
                build cleared. Deleting work does not un-charge the credits it used, and an auditable balance
                depends on those rows staying put.
              </li>
              <li>
                <strong>Analytics events are retained indefinitely</strong> today. They are not deleted when a
                project is deleted. If your account is deleted, the events remain but are detached from you —
                the user id on them is cleared.
              </li>
              <li>
                <strong>Support tickets and their messages are kept until you delete your account.</strong>{" "}
                Nothing ages them out, including once a ticket is resolved: the thread is your own record of
                what you were told, and it stays readable on the support page for as long as the account
                exists.
              </li>
              <li>
                <strong>Sessions</strong> expire 30 days after sign-in, and are removed when you sign out.
              </li>
              <li>
                <strong>Account data</strong> is kept for as long as your account exists. When you delete your
                account, your email address, name, password hash and linked accounts are destroyed along with
                your projects and your support tickets; the credit ledger and the moderation record of any
                blocked publish survive,
                no longer linked to your name or your email address. Exactly what goes and what stays is
                itemised on{" "}
                <Link href="/legal/rights">Your data and your rights</Link>.
              </li>
            </ul>

            <h2>Your choices and your rights</h2>
            <p>
              Depending on where you live, you may have the right to access, correct, export, or delete your
              personal data, and to object to or restrict certain processing.{" "}
              <Link href="/legal/rights">Your data and your rights</Link> is the page that acts on all of this
              — it holds both self-serve tools and the detail behind them. In summary:
            </p>
            <ul>
              <li>
                <strong>Download everything we hold about you.</strong> A single JSON file covering your
                account, every project and its files, chat messages, build records, your credit ledger, your
                analytics events, your support tickets and our replies to them, operator notes and reward
                connections. No request needed, and it names what
                it deliberately leaves out.
              </li>
              <li>
                <strong>Get a copy of one project&apos;s code.</strong> Every project can also be downloaded as
                a zip of its source tree from the editor, which is the quickest route if the code is all you
                want.
              </li>
              <li>
                <strong>Delete a project.</strong> Delete it from your dashboard at any time; that is also how you
                withdraw a published site.
              </li>
              <li>
                <strong>Delete your account.</strong> Request it from{" "}
                <Link href="/legal/rights">Your data and your rights</Link>. Nothing is destroyed for seven
                days, and it takes a second confirmation after that. Your projects, files, messages, builds,
                sessions, support tickets, operator notes and sign-in details are destroyed; your credit ledger is kept as a
                financial and anti-fraud record, stripped of anything that identifies you, and your analytics
                events are detached rather than deleted. The reasons for each are set out on that page. You can
                also just email <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
              </li>
              <li>
                <strong>Cap your own spending.</strong> Settings lets you set a ceiling on credits spent per
                rolling 30 days.
              </li>
              <li>
                <strong>Anything else</strong> — access, correction, or a question about this policy — email{" "}
                <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
              </li>
            </ul>

            <h2>Children</h2>
            <p>Kodely is not directed at children under 16, and we do not knowingly collect their data.</p>

            <h2>Changes to this policy</h2>
            <p>
              If we make material changes, we&apos;ll update the date at the top of this page and, where
              appropriate, notify you directly.
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

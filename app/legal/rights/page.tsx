import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";
import DataRightsPanel from "@/components/consent/DataRightsPanel";

export const metadata: Metadata = {
  title: "Your Data and Your Rights — Kodely",
  description:
    "Download everything Kodely holds about you, delete your account, and see exactly which cookies the site sets and why there is no consent banner.",
};

const UPDATED = "August 22, 2026";

export default function RightsPage() {
  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      <article className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 sm:pt-44">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your data and your rights
          </h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
            Last updated {UPDATED}
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">The short version</h2>
            <div className="article-body mt-4">
              <ul>
                <li>
                  <strong>Get a copy.</strong> One button downloads everything the product
                  database holds about you, as JSON.
                </li>
                <li>
                  <strong>Delete your account.</strong> A request, a 7-day wait, then a second
                  confirmation. Nothing is destroyed until that second step.
                </li>
                <li>
                  <strong>Your credit ledger survives deletion</strong>, stripped of anything that
                  identifies you. The reasons are spelled out below rather than buried.
                </li>
                <li>
                  <strong>There is no cookie banner</strong>, because there is nothing to consent
                  to: three cookies, all strictly necessary, no tracker of any kind. The full
                  inventory is below.
                </li>
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="article-body mt-12">
            <p>
              This page is the practical companion to the{" "}
              <Link href="/legal/privacy">Privacy Policy</Link>. That one describes what Kodely
              collects; this one is where you act on it.
            </p>
            <p>
              Kodely is operated by{" "}
              <strong>[OPERATING ENTITY AND REGISTERED ADDRESS — TO BE CONFIRMED]</strong>. You can
              reach a human about anything here at{" "}
              <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mt-10">
            <DataRightsPanel />
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="article-body mt-14">
            <h2>What the download contains</h2>
            <p>
              A single JSON file, generated at the moment you ask for it, scoped to your account
              and nobody else&apos;s. It holds:
            </p>
            <ul>
              <li>
                <strong>Your account</strong> — email, name, when you signed up, your role, your
                spending cap, your Google account identifier if you linked one, your Stripe
                customer identifier if you have bought credits, and your current credit balance.
                Not your password: we hold only a salted scrypt hash of it, which is not
                reversible and would tell you nothing.
              </li>
              <li>
                <strong>Every project</strong> — name, URL slug, dates, whether it is live, and
                every file in it. Both the source tree you edit and the compiled output, in both
                their draft and published states. The per-project zip in the editor only ever
                contains draft source, so this is the complete version.
              </li>
              <li>
                <strong>Every chat message</strong> in every project, yours and Kodely&apos;s.
              </li>
              <li>
                <strong>Every build</strong> — the prompt, the model, token counts, the real cost
                in micro-dollars, credits charged, repair attempts, any error, and the full file
                snapshot taken after each successful build.
              </li>
              <li>
                <strong>Your credit ledger</strong> — every grant and charge, with its reason and
                the balance it produced.
              </li>
              <li>
                <strong>Your reward connections</strong> — which platforms you connected for free
                credits and when. What we store per connection is a keyed hash, not your username
                or account id, and the file explains that rather than presenting the hash as if it
                meant something.
              </li>
              <li>
                <strong>Your analytics events</strong> — the first-party product events recorded
                against your user id, with their properties.
              </li>
              <li>
                <strong>Every support ticket</strong> you opened — its subject, category, status
                and the whole conversation on it, both what you wrote and what we replied.
              </li>
              <li>
                <strong>Operator notes</strong> written about you by our support staff, in full.
              </li>
              <li>
                <strong>Sign-in sessions</strong> (when, and until when — never the token),{" "}
                <strong>transactional emails sent to you</strong>, and any{" "}
                <strong>publish-time moderation findings</strong> on your projects.
              </li>
            </ul>
            <p>
              The file also carries a list of what is deliberately <em>not</em> in it and why —
              your password hash, session tokens, the staff email on each support note and each
              ticket reply, admin audit records, server and CDN access logs, and data held by Anthropic, Stripe, Google
              or Discord under their own policies.
            </p>

            <h2>What deletion destroys</h2>
            <p>
              Deleting your account is irreversible. There is no soft-delete, no undo, and no
              backup a support agent can restore from. It destroys:
            </p>
            <ul>
              <li>every project, and with it every file, every chat message and every build record, including the file snapshots that make rollback possible;</li>
              <li>
                <strong>your published sites.</strong> Each one goes offline and its{" "}
                <code>*.kodely.site</code> address stops resolving. A page already cached at the
                CDN or in a visitor&apos;s browser can survive for up to a minute after that;
              </li>
              <li>your email address, your name, your password hash, your linked Google account and your Stripe customer identifier;</li>
              <li>every sign-in session, so you are signed out everywhere immediately;</li>
              <li>every support ticket you opened and every message on it, including our replies;</li>
              <li>every operator note written about you, and the record of transactional emails we sent you.</li>
            </ul>
            <p>Your credit balance goes with the account. Deleting is not a refund.</p>

            <h2>What deletion keeps, and why</h2>
            <p>
              Two things survive. We would rather say so here than have you discover it later.
            </p>
            <h3>Credit ledger entries</h3>
            <p>
              Your ledger rows stay: a number, a reason, the resulting balance, and a timestamp,
              attached to an account row that no longer holds your email, your name or any other
              identifier. Three reasons, none of them convenience:
            </p>
            <ul>
              <li>
                it is a <strong>financial record</strong>. Rows for purchased credits reference the
                payment that created them, and a balance nobody can audit is a balance nobody
                should trust;
              </li>
              <li>
                it is the <strong>anti-fraud record for free credits</strong>. Reward credits are
                granted once per external social account, and the only thing enforcing that is a
                keyed hash stored in the ledger. If deleting an account erased those rows, deleting
                and re-registering would be an unlimited way to mint free credits, which are real
                money;
              </li>
              <li>
                it is <strong>append-only by design</strong>: every balance in the product is
                derived from it rather than stored, so removing rows would rewrite history.
              </li>
            </ul>
            <p>
              What is left holds no email address, no name and no sign-in details — a number, a
              reason, a balance and a date, against an account row that no longer describes anyone.
              If you want the underlying payment records themselves removed, that is a question for
              our payment processor, who holds them under their own retention rules and their own
              legal obligations.
            </p>
            <h3>Analytics events, detached</h3>
            <p>
              Product events are not deleted; the user id on them is cleared, so they stop being
              connected to you and remain only as anonymous counts of things that happened. This is
              the behaviour the database has always had, and it is what makes it possible to keep a
              year-over-year comparison honest without keeping a year of anyone&apos;s identity.
            </p>
            <h3>And one narrower case</h3>
            <p>
              If a publish attempt of yours ever tripped an abuse check — a phishing login form, a
              wallet-drainer pattern — that finding stays, and so does the record of any site an
              operator took down. Otherwise deleting an account would be a way to erase the evidence
              of an abuse attempt and start over clean. To be exact about what those records hold:
              the project id, the site address, the rule that fired and the fragment of the page
              that fired it. They are not linked to a name or an email address once your account is
              gone, but they are not empty either, so we would rather you knew.
            </p>

            <h2>Why deletion takes a week</h2>
            <p>
              Because the alternative is worse. A single button that immediately destroys years of
              work is a button a misclick can press, and a button anyone who has borrowed your
              signed-in laptop can press. So: you request deletion, we email the address on the
              account straight away, your account keeps working untouched, and after seven days you
              come back and confirm. You can cancel at any point before that.
            </p>
            <p>
              To be straightforward about the mechanism: the second confirmation is what carries
              the deletion out, and Kodely does not run a background job that would do it for you
              if you never returned. If you would rather not come back to the site, email{" "}
              <a href="mailto:privacy@kodely.me">privacy@kodely.me</a> after the week is up and we
              will complete it for you.
            </p>

            <h2>Cookies: why there is no banner</h2>
            <p>
              The honest answer is that a banner here would protect nobody. Consent banners exist
              because of rules about storing things on your device that are not needed to deliver
              what you asked for — overwhelmingly, advertising and analytics trackers. Kodely sets
              none. Here is every cookie on kodely.me, in full:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Cookie</th>
                  <th>What it does</th>
                  <th>Lifetime</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>kodely_session</code>
                  </td>
                  <td>
                    Keeps you signed in. Holds a random token; the database stores only a hash of
                    it. HttpOnly, SameSite=Lax, Secure.
                  </td>
                  <td>30 days</td>
                </tr>
                <tr>
                  <td>
                    <code>kodely_auth</code>
                  </td>
                  <td>
                    Says only <em>that</em> someone is signed in — its entire value is the digit
                    1. No name, no email address, no part of the token above. Readable by the page
                    on purpose, which is why it is allowed to contain nothing worth reading: it
                    lets a page served from cache show &ldquo;Portal&rdquo; instead of &ldquo;Sign
                    in&rdquo;. Written and deleted at the same moments as the session cookie.
                    SameSite=Lax, Secure.
                  </td>
                  <td>30 days</td>
                </tr>
                <tr>
                  <td>
                    <code>kodely_google_oauth_state</code>
                  </td>
                  <td>
                    Set only when you click &ldquo;Sign in with Google&rdquo;. Carries a
                    one-time value that proves the reply from Google answers your request and not
                    someone else&apos;s forgery. Deleted the moment you come back.
                  </td>
                  <td>10 minutes</td>
                </tr>
                <tr>
                  <td>
                    <code>kodely_discord_reward_state</code>
                  </td>
                  <td>
                    The same thing, set only when you choose to connect Discord for reward credits.
                  </td>
                  <td>10 minutes</td>
                </tr>
              </tbody>
            </table>
            <p>
              That is the entire list. All four are strictly necessary — two are security measures,
              one is what being signed in <em>is</em>, and the fourth does nothing but repeat that
              fact loudly enough for a cached page to hear it. There is no advertising
              pixel, no Google Analytics, no third-party tag manager, no fingerprinting script, and
              no cookie that follows you to another site. A banner over that set would ask you to
              agree to nothing, would change nothing whichever button you pressed, and would teach
              you that clicking through dialogs is the price of reading a page. We would rather
              publish the list.
            </p>
            <p>
              Your browser also keeps three things locally that never reach our servers: your
              light/dark preference, whether you have dismissed the first-run checklist, and — if
              you typed a prompt on the homepage before signing in — that prompt, held until the
              project is created for you. Clearing your browser storage for kodely.me removes all
              three.
            </p>
            <p>
              Published <code>*.kodely.site</code> sites are served under a policy that blocks
              every external host, so a generated page cannot load a third-party script or tracker
              even if the generated code asked for one.
            </p>
            <p>
              Our product analytics are a separate matter, and not a cookie question at all: they
              are recorded on our own servers against your user id after you sign in, never by a
              script in your browser and never shared with an analytics vendor. They are covered by
              the transparency and the rights on this page — they are in your download, and they
              are detached from you when you delete your account.
            </p>

            <h2>Other things you can do</h2>
            <ul>
              <li>
                <strong>Correct your details.</strong> Your display name is yours to change in{" "}
                <Link href="/settings">Settings</Link>. Your email address is not — it is what you
                sign in with, and there is no self-serve editor for it. Email{" "}
                <a href="mailto:privacy@kodely.me">privacy@kodely.me</a> and a person will change
                it for you.
              </li>
              <li>
                <strong>Delete a single project</strong> from your dashboard. That is also how you
                take one published site offline without closing your account.
              </li>
              <li>
                <strong>Cap your own spending</strong> in{" "}
                <Link href="/settings/credits">Settings</Link>, per rolling 30 days.
              </li>
              <li>
                <strong>See and end your sign-in sessions</strong> in{" "}
                <Link href="/settings/security">Settings</Link>. The same download and deletion
                controls as on this page are there too, for when you are already signed in.
              </li>
              <li>
                <strong>Ask us anything else</strong> — including objecting to a particular use of
                your data — at <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
              </li>
            </ul>

            <h2>What this page does not claim</h2>
            <p>
              Laws such as the GDPR in Europe and the UK, and the CCPA in California, give people
              in those places rights over their personal data. Depending on where you live you may
              have the right to access, correct, export, delete, or object to the use of yours, and
              to complain to a data protection regulator.
            </p>
            <p>
              We are not claiming a certification, an audit, or a legal conclusion about which of
              those laws applies to us — the operating entity and governing law are still to be
              confirmed, which is also why this page cannot yet tell you which regulator to
              complain to. What this page does is describe, accurately, what Kodely can do for you
              today and exactly what happens when you use it. If something here turns out not to
              match what the code does, that is a bug and we want to hear about it at{" "}
              <a href="mailto:privacy@kodely.me">privacy@kodely.me</a>.
            </p>
          </div>
        </Reveal>
      </article>

      <MarketingFooter />
    </div>
  );
}

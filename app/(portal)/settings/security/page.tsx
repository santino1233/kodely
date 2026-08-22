import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentSession, getCurrentUser } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listSessions } from "@/app/api/account/_sessions";
import {
  CONFIRMATION_PHRASE,
  DELETION_GRACE_DAYS,
  PRIVACY_EMAIL,
  deletionPreview,
  deletionStatus,
} from "@/app/api/account/_deletion";
import SessionList from "../SessionList";
import type { DisplaySession } from "../SessionList";
import DataExportButton from "../DataExportButton";
import DeleteAccountPanel from "../DeleteAccountPanel";
import type { DeletionView } from "../DeleteAccountPanel";
import { formatDateTime, formatHoursLeft } from "../_format";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
export const metadata: Metadata = { title: "Security · Settings" };

/* SECURITY — everything that decides who can reach this account, and the two
   irreversible things only the account holder may do to it.

   Four real cards. Nothing on this page is a placeholder: the sign-in card
   reports what the User row actually holds, the session list is the Session
   table, and the export and deletion controls call the routes /legal/rights
   already calls. Where something does not exist — a password change, a second
   factor, a sign-in history — it is stated in the card it would have belonged
   to rather than drawn as a switch that writes nowhere. */
export default async function SettingsSecurityPage() {
  // The SESSION, not just the user: the list has to mark exactly one row as
  // this device, and only the session id can identify it.
  const [user, session] = await Promise.all([getCurrentUser(), getCurrentSession()]);
  if (!user || !session) redirect("/login");

  const [list, status, preview] = await Promise.all([
    listSessions(session.userId, session.id),
    deletionStatus(user.id),
    deletionPreview(user.id),
  ]);

  const sessions: DisplaySession[] = list.sessions.map((row) => ({
    id: row.id,
    current: row.current,
    createdAtIso: row.createdAt,
    createdAtLabel: formatDateTime(row.createdAt),
    expiresAtIso: row.expiresAt,
    expiresAtLabel: formatDateTime(row.expiresAt),
  }));

  // Booleans, never the values. passwordHash must not cross to the client even
  // as a length, and googleId is an identifier at another company.
  const hasPassword = user.passwordHash !== null;
  const hasGoogle = user.googleId !== null;

  const view: DeletionView =
    status.state === "pending"
      ? {
          state: "pending",
          requestedAt: formatDateTime(status.requestedAt),
          scheduledFor: formatDateTime(status.scheduledFor),
          timeLeft: formatHoursLeft(status.hoursLeft),
        }
      : status.state === "due"
        ? {
            state: "due",
            requestedAt: formatDateTime(status.requestedAt),
            scheduledFor: formatDateTime(status.scheduledFor),
          }
        : status.state === "erased"
          ? { state: "erased", erasedAt: formatDateTime(status.erasedAt) }
          : { state: "none" };

  return (
    <>
      <Card>
        <CardHeader
          title="How you sign in"
          action={<KeyRound className="size-4 text-ink-3" aria-hidden />}
        />
        <ul className="mt-4 flex flex-col gap-2.5">
          <li className="flex flex-wrap items-center gap-2 text-sm text-ink">
            Password
            {hasPassword ? (
              <Badge tone="ok" dot>
                Set
              </Badge>
            ) : (
              // `dot` on both halves — colour alone is not a status channel,
              // and "Set"/"Not set" is exactly a status.
              <Badge tone="neutral" dot>
                Not set
              </Badge>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-2 text-sm text-ink">
            Google
            {hasGoogle ? (
              <Badge tone="ok" dot>
                Linked
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Not linked
              </Badge>
            )}
          </li>
        </ul>

        {/* STATED, NOT DRAWN. Nothing in app/api writes passwordHash after the
            signup route, so there is no change-password and no reset to wire a
            button to, and there is no second-factor anywhere in the schema.
            A greyed-out "Change password" would imply a route exists. */}
        <div className="mt-5 rounded-lg border border-hair bg-surface-2 p-4 text-[0.8125rem] leading-relaxed text-ink-2">
          <p>
            <span className="font-medium text-ink">
              There is no way to change your password here, and no password reset.
            </span>{" "}
            {hasPassword
              ? "Your password was set when you signed up and nothing in the product has written it since."
              : "You sign in with Google, so this account has never had a password and cannot be given one today."}{" "}
            If you need it changed, email{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="k-focus rounded-xs text-brand underline underline-offset-2 hover:no-underline"
            >
              {PRIVACY_EMAIL}
            </a>
            . Until then, the strongest thing you can do if you think somebody else is signed in is
            to end their session below.
          </p>
          <p className="mt-2.5">
            Two-factor authentication does not exist yet either — no authenticator app, no SMS
            code, no recovery codes. We would rather say so than show a switch that saves nothing.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Active sessions"
          description="Every browser currently signed in to this account. Signing one out takes effect immediately."
        />

        <SessionList
          sessions={sessions}
          total={list.total}
          // The caller's own session is live by definition — it just answered
          // this request — so everything else is exactly one fewer.
          others={Math.max(0, list.total - 1)}
          limit={list.limit}
        />

        {/* What the row genuinely knows, said plainly, so nobody reads the two
            dates as a shortened version of something richer. */}
        <p className="mt-5 text-xs leading-relaxed text-ink-3">
          A session records four things and no more: when it was created, when it expires, which
          account it belongs to, and a one-way hash of the sign-in cookie. Kodely does not store the
          browser, the device or the IP address behind a session, so this list cannot tell you
          &ldquo;Chrome on a Mac in Berlin&rdquo; — and will not guess. Sessions last 30 days and
          nothing extends them. Expired ones already do nothing and are not listed.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          There is no sign-in history to go with this, deliberately: failed and successful sign-in
          attempts are counted only as salted hashes in a rate-limiting bucket, with no account
          attached to them, so they can never be shown to you as &ldquo;your sign-ins&rdquo;.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Your data"
          // This sentence is a WRITTEN ENUMERATION of what the export contains,
          // so it goes stale the moment the export gains a section. Support
          // threads were added to app/api/account/export/route.ts after this
          // card was written and are listed here for that reason.
          description="One JSON file with everything the product database holds about you: your account, every project with its files, chat messages and build records, your credit ledger, your analytics events, your support threads and every message in them, and any operator notes written about you. The file also names what it deliberately leaves out, and why."
        />
        <div className="mt-4">
          <DataExportButton />
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Generated as it downloads, so a large account takes a moment to start. One export a
          minute.
        </p>
      </Card>

      {/* The danger zone gets a red outline rather than a red fill: it has to
          read as the end of the page, not as an error that has already
          happened. A `ring` and not a border override — both `border-hair` and
          a `border-danger` would set border-color, and which one wins depends
          on stylesheet order rather than on the order they are written here. */}
      <Card className="ring-1 ring-danger/30">
        {/* A Badge rather than `k-label text-danger`: .k-label is unlayered CSS
            and sets its own colour, so it would beat a Tailwind text utility
            regardless of the order the two are written in. */}
        <div className="mb-3">
          <Badge tone="danger">Danger zone</Badge>
        </div>
        <DeleteAccountPanel
          view={view}
          counts={{
            projects: preview.projects,
            liveSites: preview.liveSites,
            files: preview.files,
            messages: preview.messages,
            builds: preview.builds,
            sessions: preview.sessions,
            supportNotes: preview.supportNotes,
            // Support threads became a real feature after this page was
            // written. deletionPreview() counts them and erasure destroys
            // them, so the consent dialog has to name them — a preview that
            // silently under-reports is the exact failure _deletion.ts warns
            // about: asking for consent to something unstated.
            supportTickets: preview.supportTickets,
            supportMessages: preview.supportMessages,
            emailsSent: preview.emailsSent,
            analyticsEvents: preview.analyticsEvents,
            creditLedgerRows: preview.creditLedgerRows,
            creditBalance: preview.creditBalance,
          }}
          graceDays={DELETION_GRACE_DAYS}
          confirmationPhrase={CONFIRMATION_PHRASE}
          contactEmail={PRIVACY_EMAIL}
        />
      </Card>
    </>
  );
}

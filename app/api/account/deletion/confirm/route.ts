import { destroySession, requireUser } from "@/lib/auth";
import { isMailConfigured, sendMail } from "@/lib/mail";
import {
  CONFIRMATION_PHRASE,
  DELETION_GRACE_DAYS,
  PRIVACY_EMAIL,
  deletionStatus,
  eraseAccount,
} from "../../_deletion";

export const dynamic = "force-dynamic";

// Step two of two, and the only irreversible route in this directory.
//
// It refuses unless ALL of these hold:
//   * a request exists and its grace period has elapsed (state "due");
//   * the confirmation phrase is typed again, exactly;
//   * the caller is signed in as the account being erased.
//
// There is no admin path here and no way to name another account: the id comes
// from the session and nowhere else.

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== CONFIRMATION_PHRASE) {
    return Response.json(
      { error: `Type ${CONFIRMATION_PHRASE} exactly to continue.` },
      { status: 400 },
    );
  }

  const status = await deletionStatus(user.id);

  if (status.state === "erased") {
    return Response.json({ error: "This account has already been erased." }, { status: 409 });
  }
  if (status.state === "none") {
    return Response.json(
      {
        error: `Request deletion first. Nothing is erased until ${DELETION_GRACE_DAYS} days after a request.`,
      },
      { status: 409 },
    );
  }
  if (status.state === "pending") {
    return Response.json(
      {
        error: `This request can't be carried out until ${status.scheduledFor.toISOString()}.`,
        status,
      },
      { status: 409 },
    );
  }

  // Captured before erasure destroys it.
  const email = user.email;

  const receipt = await eraseAccount(user.id);

  // Every session row is gone, so the cookie is already inert — this clears it
  // from the browser so the next page load reads as signed out immediately
  // rather than as an expired session.
  await destroySession();

  // Sent after the fact, deliberately: this says what happened, not what is
  // about to. If it fails, the erasure still stands.
  if (isMailConfigured()) {
    try {
      await sendMail({
        to: email,
        subject: "Your Kodely account has been deleted",
        text:
          `Your Kodely account has been deleted, as you asked.\n\n` +
          `Deleted: ${receipt.projectsDeleted} project(s), ${receipt.filesDeleted} file(s), ` +
          `${receipt.messagesDeleted} message(s), ${receipt.buildsDeleted} build(s), and your\n` +
          `sign-in details. ${receipt.liveSitesWithdrawn} published site(s) were taken offline.\n\n` +
          `Kept: ${receipt.creditLedgerRowsRetained} credit ledger entries, as a financial record.\n` +
          `They no longer carry your email address, name or any other identifier.\n` +
          `${receipt.analyticsEventsDetached} analytics event(s) were detached from your account\n` +
          `rather than deleted.\n\n` +
          `Why, in full: https://kodely.me/legal/rights\n` +
          `Questions: ${PRIVACY_EMAIL}\n`,
      });
    } catch (err) {
      console.error("[account-deletion] failed to send completion notice:", err);
    }
  }

  return Response.json({ receipt });
}

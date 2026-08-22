import { requireUser } from "@/lib/auth";
import { isMailConfigured, sendMail } from "@/lib/mail";
import {
  CONFIRMATION_PHRASE,
  DELETION_GRACE_DAYS,
  PRIVACY_EMAIL,
  cancelDeletion,
  deletionPreview,
  deletionStatus,
  requestDeletion,
} from "../_deletion";

export const dynamic = "force-dynamic";

// Step one of two. This route can only ever CREATE or WITHDRAW a request —
// nothing it does destroys anything. Erasure lives at ./confirm, behind the
// grace period, so that no single request to a single URL can end an account.

/** Current state plus what erasure would destroy. */
export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [status, preview] = await Promise.all([
    deletionStatus(user.id),
    deletionPreview(user.id),
  ]);

  return Response.json({
    status,
    preview,
    graceDays: DELETION_GRACE_DAYS,
    confirmationPhrase: CONFIRMATION_PHRASE,
    contactEmail: PRIVACY_EMAIL,
  });
}

/** Open a request. */
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

  const result = await requestDeletion(user.id, user.email);
  if (!result.ok) {
    return Response.json(
      {
        error:
          result.reason === "erased"
            ? "This account has already been erased."
            : "There is already an open deletion request for this account.",
      },
      { status: 409 },
    );
  }

  // The one notification that matters for security. A deletion request made
  // from a stolen session is invisible to the owner until their work is gone;
  // an email lands in an inbox the attacker may not hold, while there is still
  // a week in which to cancel. Never allowed to fail the request — an
  // unsendable email must not stop someone exercising a right.
  if (isMailConfigured()) {
    const scheduled =
      result.status.state === "pending" || result.status.state === "due"
        ? result.status.scheduledFor.toISOString()
        : "shortly";
    try {
      await sendMail({
        to: user.email,
        subject: "Your Kodely account is scheduled for deletion",
        text:
          `Someone signed in to your Kodely account and asked us to delete it.\n\n` +
          `Nothing has been deleted yet. The request cannot be carried out before\n` +
          `${scheduled} (${DELETION_GRACE_DAYS} days from now), and until then your\n` +
          `account works exactly as before.\n\n` +
          `If this was you, no action is needed — sign in and confirm after that date\n` +
          `to complete it: https://kodely.me/legal/rights\n\n` +
          `If this was NOT you, someone else has access to your account. Cancel the\n` +
          `request at the link above, change your password, and email us at\n` +
          `${PRIVACY_EMAIL}.\n`,
      });
    } catch (err) {
      console.error("[account-deletion] failed to send request notice:", err);
    }
  }

  return Response.json({ status: result.status });
}

/** Withdraw a request. */
export async function DELETE() {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const cancelled = await cancelDeletion(user.id);
  if (!cancelled) {
    return Response.json({ error: "There is no open deletion request." }, { status: 409 });
  }

  return Response.json({ status: await deletionStatus(user.id) });
}

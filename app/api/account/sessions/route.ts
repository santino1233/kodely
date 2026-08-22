import { destroySession, getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSessions } from "../_sessions";

export const dynamic = "force-dynamic";

// ── Listing and revoking sign-in sessions ─────────────────────────────────
//
// Every handler resolves the CURRENT SESSION rather than just the current
// user, because both of them need the caller's own session id: the list has to
// mark exactly one row "this device", and the revoke has to know which row it
// must not quietly delete out from under the person pressing the button.
//
// Three shapes of revoke, and the difference between them is the whole point:
//
//   { "id": "<session id>" }   one other session. Refused for the caller's own
//                              — that is signing out, and it is a different
//                              button with a different consequence.
//   { "scope": "others" }      every session except this one. The safe "all":
//                              the person stays signed in here.
//   { "scope": "all" }         every session INCLUDING this one, and the cookie
//                              is cleared so the browser reads as signed out
//                              immediately rather than as an expired session.
//                              Only ever reached from a control that says so.
//
// Nothing here can act on another account: the user id comes from the session
// and is repeated inside every WHERE, so a session id belonging to someone else
// is indistinguishable from one that does not exist.

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 });

  return Response.json(await listSessions(session.userId, session.id));
}

export async function DELETE(req: Request) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Send a JSON object with either an id or a scope." },
      { status: 400 },
    );
  }

  // hasOwnProperty, never `in`: `in` walks the prototype chain, so `{}` would
  // appear to carry every key on Object.prototype and this route would try to
  // revoke a session named after a built-in.
  const hasId = Object.prototype.hasOwnProperty.call(body, "id");
  const hasScope = Object.prototype.hasOwnProperty.call(body, "scope");

  // Exactly one of them. Both together is ambiguous about what should happen
  // to the named session, and neither is a request with no verb in it.
  if (hasId === hasScope) {
    return Response.json(
      { error: "Send either one session id or a scope, not both." },
      { status: 400 },
    );
  }

  if (hasScope) {
    const scope = (body as { scope: unknown }).scope;
    if (scope !== "others" && scope !== "all") {
      return Response.json({ error: 'Scope must be "others" or "all".' }, { status: 400 });
    }

    if (scope === "others") {
      const { count } = await db.session.deleteMany({
        where: { userId: session.userId, NOT: { id: session.id } },
      });
      return Response.json({ revoked: count, signedOut: false });
    }

    const { count } = await db.session.deleteMany({ where: { userId: session.userId } });
    // The row behind this cookie is already gone, so the cookie is inert.
    // Clearing it is what makes the next page load read as signed out instead
    // of as a session that mysteriously stopped working — the same reasoning
    // as the deletion/confirm route.
    await destroySession();
    return Response.json({ revoked: count, signedOut: true });
  }

  const id = (body as { id: unknown }).id;
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    return Response.json({ error: "That is not a session id." }, { status: 400 });
  }

  if (id === session.id) {
    return Response.json(
      {
        error:
          "That is the session you are using right now. Sign out to end it, or revoke every other session instead.",
      },
      { status: 409 },
    );
  }

  const { count } = await db.session.deleteMany({ where: { id, userId: session.userId } });
  if (count === 0) {
    // Same answer for "already ended" and "belongs to somebody else". The
    // second must not be distinguishable from the first.
    return Response.json({ error: "That session has already ended." }, { status: 404 });
  }

  return Response.json({ revoked: count, signedOut: false });
}

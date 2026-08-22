// lib/auth-cookies.ts — the non-sensitive "someone is signed in" hint.
//
// createSession/destroySession and the proxy wiring around these helpers need
// a request, a cookie jar and a database and are not tested here (see
// scripts/test/README.md). What IS testable is the part where a mistake is
// invisible in production because every wrong answer still renders a
// plausible-looking nav: the cookie-string parse, and the two-cookie truth
// table that decides when the proxy repairs a hint.
//
// The row that matters most is "no session, hint present" -> "clear". Get it
// wrong and a signed-out visitor is offered "Portal" on every marketing page
// until their browser happens to drop the cookie.

import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_HINT_COOKIE,
  AUTH_HINT_MAX_AGE_SECONDS,
  AUTH_HINT_VALUE,
  SESSION_COOKIE,
  authHintAction,
  readAuthHint,
} from "../lib/auth-cookies.ts";

// ── the constants themselves ───────────────────────────────────────────────

test("the two cookie names are distinct and neither is empty", () => {
  // They are written side by side in createSession; one typo collapsing them
  // would have the hint overwrite the real session token.
  assert.ok(SESSION_COOKIE);
  assert.ok(AUTH_HINT_COOKIE);
  assert.notEqual(SESSION_COOKIE, AUTH_HINT_COOKIE);
});

test("the hint's ceiling matches the 30-day session length", () => {
  // SESSION_DAYS in lib/auth.ts. A ceiling shorter than the session would
  // blank the nav for still-signed-in people; longer would leave hints the
  // proxy has to keep cleaning up.
  assert.equal(AUTH_HINT_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
});

// ── readAuthHint ───────────────────────────────────────────────────────────

test("a cookie string containing the hint reads true", () => {
  assert.equal(readAuthHint(`${AUTH_HINT_COOKIE}=${AUTH_HINT_VALUE}`), true);
});

test("the hint is found wherever it sits among other cookies", () => {
  // document.cookie has no guaranteed order, so first, middle and last all
  // have to work. The leading space after "; " is what the browser emits.
  const other = "kodely-theme=dark";
  const hint = `${AUTH_HINT_COOKIE}=${AUTH_HINT_VALUE}`;
  assert.equal(readAuthHint(`${hint}; ${other}`), true);
  assert.equal(readAuthHint(`${other}; ${hint}; a=b`), true);
  assert.equal(readAuthHint(`${other}; a=b; ${hint}`), true);
});

test("no cookies at all reads false", () => {
  for (const empty of ["", null, undefined]) {
    assert.equal(readAuthHint(empty), false);
  }
});

test("a different cookie whose name merely ends with the hint's does not count", () => {
  // Substring matching on the raw string is the obvious wrong implementation
  // and it would make this true.
  assert.equal(readAuthHint(`not_${AUTH_HINT_COOKIE}=${AUTH_HINT_VALUE}`), false);
  assert.equal(readAuthHint(`x${AUTH_HINT_COOKIE}=${AUTH_HINT_VALUE}`), false);
});

test("the hint set to anything other than its one literal value reads false", () => {
  // The cookie is JS-writable by design, so its vocabulary has to be closed.
  // "0", "false" and "" are what a half-hearted clear-out leaves behind.
  for (const value of ["0", "false", "", "2", "true"]) {
    assert.equal(readAuthHint(`${AUTH_HINT_COOKIE}=${value}`), false);
  }
});

test("a session cookie on its own does not read as a hint", () => {
  // The session cookie is httpOnly and therefore never in document.cookie,
  // but the same parser also reads Cookie headers on the server.
  assert.equal(readAuthHint(`${SESSION_COOKIE}=sometoken`), false);
});

test("a malformed cookie string does not throw or produce a false positive", () => {
  assert.equal(readAuthHint(";;;"), false);
  assert.equal(readAuthHint(AUTH_HINT_COOKIE), false); // name, no "=value"
  assert.equal(readAuthHint(`${AUTH_HINT_COOKIE}=`), false);
});

// ── authHintAction: the truth table the proxy runs on ──────────────────────

test("agreeing cookies are left completely alone", () => {
  // This is the guarantee that keeps the statically cached pages cacheable:
  // an anonymous visitor and a settled signed-in one both get NO Set-Cookie.
  assert.equal(authHintAction(true, true), "none");
  assert.equal(authHintAction(false, false), "none");
});

test("a session with no hint is backfilled", () => {
  // Every session that existed before this feature shipped.
  assert.equal(authHintAction(true, false), "set");
});

test("a hint with no session is cleared", () => {
  // The failure mode this whole mechanism has to get right: without this the
  // nav goes on saying "Portal" to someone who is signed out.
  assert.equal(authHintAction(false, true), "clear");
});

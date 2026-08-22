// lib/support.ts — the parts reachable without a database.
//
// Everything in that module that touches Postgres (listCustomerTickets,
// appendMessage, the read marks) is deliberately NOT tested here — see
// scripts/test/README.md. What is left is the part the rest of the feature is
// built on and where a bug is silent: the closed-set guards, and the two unread
// predicates that decide whether a customer is told a reply is waiting.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SUPPORT_CATEGORY,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_GUIDANCE,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_INFO,
  categoryLabel,
  categoryShort,
  guidanceFor,
  hasUnreadReply,
  isSupportCategory,
  isSupportStatus,
  isUnseenByStaff,
  supportTopic,
} from "../lib/support.ts";

const T0 = new Date("2026-08-20T10:00:00.000Z");
const T1 = new Date("2026-08-20T11:00:00.000Z");

// ── The closed sets, and the prototype chain ──────────────────────────────
//
// Every guard in this module uses Object.prototype.hasOwnProperty.call rather
// than `x in OBJ`. These are the names that make the difference: they resolve
// through the prototype chain of any plain object, so `in` would report them
// as members of a vocabulary they are not in — and the caller would then index
// the record with them and get a Function where it expected a label.

const PROTOTYPE_NAMES = [
  "toString",
  "constructor",
  "hasOwnProperty",
  "valueOf",
  "__proto__",
  "isPrototypeOf",
  "propertyIsEnumerable",
];

test("isSupportStatus accepts exactly the declared statuses", () => {
  for (const status of SUPPORT_STATUSES) assert.equal(isSupportStatus(status), true, status);
  assert.equal(SUPPORT_STATUSES.length, 3);
});

test("isSupportStatus rejects prototype-chain names", () => {
  for (const name of PROTOTYPE_NAMES) {
    assert.equal(isSupportStatus(name), false, name);
    // The whole point of the guard: whatever it lets through gets used as a key.
    assert.equal(Object.prototype.hasOwnProperty.call(SUPPORT_STATUS_INFO, name), false, name);
  }
});

test("isSupportStatus rejects non-strings and near-misses", () => {
  for (const value of [null, undefined, 0, 1, {}, [], "open", "Open", "", "resolved"]) {
    assert.equal(isSupportStatus(value), false, JSON.stringify(value));
  }
});

test("isSupportCategory accepts exactly the declared categories", () => {
  for (const category of SUPPORT_CATEGORIES) {
    assert.equal(isSupportCategory(category), true, category);
  }
  assert.equal(isSupportCategory(DEFAULT_SUPPORT_CATEGORY), true);
});

test("isSupportCategory rejects prototype-chain names", () => {
  for (const name of PROTOTYPE_NAMES) assert.equal(isSupportCategory(name), false, name);
});

test("every status and category has a label, and none is blank", () => {
  for (const status of SUPPORT_STATUSES) {
    const info = SUPPORT_STATUS_INFO[status];
    for (const key of ["customerLabel", "staffLabel", "customerHint"]) {
      assert.equal(typeof info[key], "string");
      assert.ok(info[key].length > 0, `${status}.${key}`);
    }
  }
  for (const category of SUPPORT_CATEGORIES) {
    assert.ok(categoryLabel(category).length > 0, category);
    assert.ok(categoryShort(category).length > 0, category);
  }
});

test("categoryLabel falls back to the raw value rather than rendering blank", () => {
  // A row written before a category existed must still be legible.
  assert.equal(categoryLabel("something-else"), "something-else");
  assert.equal(categoryShort("something-else"), "something-else");
  assert.equal(categoryLabel("toString"), "toString");
});

// ── ?topic= ───────────────────────────────────────────────────────────────

test("supportTopic resolves the two links the sidebar actually renders", () => {
  // components/app/SidebarFooter.tsx links at exactly these.
  const bug = supportTopic("bug");
  assert.ok(bug);
  assert.equal(bug.category, "bug");

  const feature = supportTopic("feature");
  assert.ok(feature);
  assert.equal(feature.category, "feature");
});

test("supportTopic returns null for prototype-chain names", () => {
  // The failure this prevents: `?topic=constructor` resolving to a Function,
  // which the composer would then read `.category` off.
  for (const name of PROTOTYPE_NAMES) assert.equal(supportTopic(name), null, name);
});

test("supportTopic returns null for anything else, and never throws", () => {
  for (const value of [undefined, "", "billing", "help", "BUG", "  bug", 5, null]) {
    assert.equal(supportTopic(value), null, JSON.stringify(value));
  }
});

test("supportTopic takes the first value when the param repeats", () => {
  // ?topic=bug&topic=feature arrives as an array.
  const topic = supportTopic(["bug", "feature"]);
  assert.ok(topic);
  assert.equal(topic.category, "bug");
  assert.equal(supportTopic([]), null);
});

test("every topic points at a category that exists", () => {
  for (const name of ["bug", "feature"]) {
    const topic = supportTopic(name);
    assert.ok(topic);
    assert.equal(isSupportCategory(topic.category), true);
    assert.ok(topic.heading.length > 0);
    assert.ok(topic.intro.length > 0);
  }
});

// ── The composer's scaffolding ────────────────────────────────────────────

test("only a bug report is scaffolded, and it asks the three things", () => {
  const bug = SUPPORT_CATEGORY_GUIDANCE.bug.scaffold;
  assert.match(bug, /expected/i);
  assert.match(bug, /happened/i);
  assert.match(bug, /tried/i);

  // A feature request is deliberately not asked for reproduction steps.
  assert.equal(SUPPORT_CATEGORY_GUIDANCE.feature.scaffold, "");
  assert.equal(SUPPORT_CATEGORY_GUIDANCE.billing.scaffold, "");
  assert.equal(SUPPORT_CATEGORY_GUIDANCE.help.scaffold, "");
});

test("guidanceFor falls back to the default category, never to undefined", () => {
  const fallback = guidanceFor("toString");
  assert.equal(fallback, SUPPORT_CATEGORY_GUIDANCE[DEFAULT_SUPPORT_CATEGORY]);
  assert.equal(guidanceFor("bug"), SUPPORT_CATEGORY_GUIDANCE.bug);
  for (const category of SUPPORT_CATEGORIES) {
    const g = guidanceFor(category);
    assert.equal(typeof g.scaffold, "string");
    assert.ok(g.bodyHint.length > 0, category);
    assert.ok(g.siteHint.length > 0, category);
  }
});

// ── Unread, on both sides ─────────────────────────────────────────────────

test("hasUnreadReply is false when staff have never replied", () => {
  assert.equal(hasUnreadReply({ lastStaffMessageAt: null, customerReadAt: null }), false);
  assert.equal(hasUnreadReply({ lastStaffMessageAt: null, customerReadAt: T1 }), false);
});

test("hasUnreadReply is true for a reply the customer has never opened", () => {
  assert.equal(hasUnreadReply({ lastStaffMessageAt: T0, customerReadAt: null }), true);
  assert.equal(hasUnreadReply({ lastStaffMessageAt: T1, customerReadAt: T0 }), true);
});

test("hasUnreadReply is false once they have opened it", () => {
  assert.equal(hasUnreadReply({ lastStaffMessageAt: T0, customerReadAt: T1 }), false);
  // Same instant counts as read: appendMessage stamps the read mark with the
  // same clock it stamps the message, so > and not >= is what keeps a reply
  // from being unread to the person who just wrote it.
  assert.equal(hasUnreadReply({ lastStaffMessageAt: T0, customerReadAt: T0 }), false);
});

test("isUnseenByStaff only ever fires on a ticket the customer wrote last", () => {
  // ANSWERED and RESOLVED are not "waiting on us", so an old read mark on one
  // must not put it back in the unread count.
  for (const status of ["ANSWERED", "RESOLVED"]) {
    assert.equal(isUnseenByStaff({ status, lastMessageAt: T1, staffReadAt: T0 }), false, status);
    assert.equal(isUnseenByStaff({ status, lastMessageAt: T1, staffReadAt: null }), false, status);
  }
});

test("isUnseenByStaff is true for an open ticket nobody has opened", () => {
  assert.equal(isUnseenByStaff({ status: "OPEN", lastMessageAt: T1, staffReadAt: null }), true);
  assert.equal(isUnseenByStaff({ status: "OPEN", lastMessageAt: T1, staffReadAt: T0 }), true);
});

test("isUnseenByStaff is false once an operator has opened it", () => {
  assert.equal(isUnseenByStaff({ status: "OPEN", lastMessageAt: T0, staffReadAt: T1 }), false);
  assert.equal(isUnseenByStaff({ status: "OPEN", lastMessageAt: T0, staffReadAt: T0 }), false);
});

test("an unknown status is never counted as unseen", () => {
  // Rows written before this vocabulary, or by hand. Silence beats a queue
  // that claims work exists because it does not recognise a word.
  assert.equal(isUnseenByStaff({ status: "PENDING", lastMessageAt: T1, staffReadAt: null }), false);
});

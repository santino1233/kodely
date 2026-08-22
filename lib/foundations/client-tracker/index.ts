import type { Foundation } from "../types";
import { KERNEL_FILES } from "./kernel";
import { APP_FILES } from "./app";

/**
 * Foundation 1 — Client Tracker.
 *
 * A single-user CRM that runs entirely in the visitor's own browser. It is a
 * real app: contacts, a logged interaction history, tasks with due dates,
 * search, filtering, sorting, CSV export, JSON backup and restore. It is not a
 * shared one, and nothing in it pretends otherwise — the storage notice is on
 * every screen and the settings page spells out, in four bullets, exactly what
 * "stored in this browser" costs the user.
 *
 * The kernel (18 files) is pre-built and generic. The app (7 files, ~11KB) is
 * schema, branding, a dashboard and a document head — that ratio is the whole
 * thesis, and docs/pro-foundations.md measures whether it actually pays.
 */
export const CLIENT_TRACKER: Foundation = {
  id: "client-tracker",
  name: "Client tracker",
  summary:
    "A private CRM for one person: clients, what was said, and what is owed next. Runs with no server.",
  cannot: [
    "Be shared. One browser on one device — a second person or a second device sees an empty app.",
    "Back anything up on its own. Clearing site data deletes everything; the JSON export is the only copy.",
    "Send or receive anything. No email, no SMS, no calendar sync, no payment — the CSP blocks every network request.",
    "Have accounts, logins or permissions. Whoever can open this browser profile can read everything in it.",
    "Hold data anyone is legally required to protect. It is not encrypted and it is not audited.",
  ],
  files: { ...KERNEL_FILES, ...APP_FILES },
};

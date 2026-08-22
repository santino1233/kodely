// Dates in this section are formatted on the SERVER, in UTC, with an explicit
// locale — and then handed to the client as finished strings.
//
// Both halves of that matter. A Server Component's output is never re-run in
// the browser, but the Client Components below it are, and `toLocaleString()`
// inside one produces the host's locale on the server and the visitor's on
// hydration: two different strings for the same instant, which React reports
// as a mismatch and repaints. Pinning the locale and the zone removes the
// disagreement, and saying "UTC" out loud is the price of not silently showing
// someone a timestamp in a timezone that is not theirs.

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** e.g. "20 Aug 2026, 14:32 UTC". */
export function formatDateTime(value: Date | string): string {
  return `${DATE_TIME.format(new Date(value))} UTC`;
}

/** e.g. "20 Aug 2026". No time, so no timezone caveat is needed. */
export function formatDate(value: Date | string): string {
  return DATE_ONLY.format(new Date(value));
}

/** "1 day" / "6 days" / "18 hours" — for a countdown, never for a timestamp. */
export function formatHoursLeft(hours: number): string {
  if (hours <= 1) return "under an hour";
  if (hours < 48) return `${hours} hours`;
  return `${Math.ceil(hours / 24)} days`;
}

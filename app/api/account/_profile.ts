// ── The one editable field on the account: User.name ──────────────────────
//
// The column has existed since the first migration and is written in exactly
// two places — the signup route and the Google callback — and read all over
// the portal ("Welcome back, <name>", the sidebar, the avatar's initials, the
// welcome email). Until now there was no way to change it after the fact,
// which meant a typo at signup was permanent and a Google display name could
// never be corrected.
//
// Normalisation lives here rather than inside the route so the form and the
// route agree on the same limit and the same rules, instead of the client
// guessing at a cap the server will enforce differently.

/**
 * Deliberately generous but finite. The name is rendered inline in a sidebar
 * 248px wide and in an email subject line; 80 characters is longer than any
 * real name and short enough that no layout has to defend against it. There is
 * no length check at signup today, so this is also the first cap the column
 * has ever had — it is enforced on write, not retroactively.
 */
export const MAX_NAME_LENGTH = 80;

/**
 * Anything longer than this is refused before normalisation runs, so a
 * megabyte of text is never walked character by character.
 */
const MAX_RAW_LENGTH = 4_000;

export type NameResult = { ok: true; name: string | null } | { ok: false; error: string };

/**
 * Characters removed rather than rejected, because none of them is something a
 * person meant to type:
 *
 *   * C0/C7 control characters, including the newlines and tabs a paste from a
 *     document carries in;
 *   * zero-width space/joiner/non-joiner and the byte-order mark, which make a
 *     name that looks identical to another one;
 *   * the bidirectional overrides (LRM/RLM, LRE…RLO, the isolates). This name
 *     is rendered inline next to other text — "Welcome back, <name>" — and an
 *     unterminated RLO reverses the rest of the line, so a display name could
 *     scramble the sentence around it. React escapes markup; it does not
 *     escape text direction.
 */
function isStrippable(code: number): boolean {
  if (code < 0x20 || code === 0x7f) return true;
  if (code >= 0x80 && code <= 0x9f) return true;
  if (code >= 0x200b && code <= 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  if (code >= 0x2066 && code <= 0x2069) return true;
  return code === 0xfeff;
}

/**
 * `null` and the empty string both mean "clear it" — the column is nullable
 * and an empty-string name would render as a blank space where a name is
 * expected, which is a third state nothing in the product knows how to show.
 */
export function normalizeName(raw: unknown): NameResult {
  if (raw === null) return { ok: true, name: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "A name has to be text. Send null to clear it." };
  }
  if (raw.length > MAX_RAW_LENGTH) {
    return { ok: false, error: `Keep your name to ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  let cleaned = "";
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += isStrippable(code) ? " " : character;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (cleaned.length === 0) return { ok: true, name: null };
  // Counted in code points, not UTF-16 units, so an emoji or an astral-plane
  // character costs one the way it looks like one.
  if (Array.from(cleaned).length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Keep your name to ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: cleaned };
}

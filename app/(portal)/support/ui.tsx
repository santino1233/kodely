import { Badge, type Tone } from "@/components/ui/Badge";
import { SUPPORT_STATUS_INFO, isSupportStatus } from "@/lib/support";

// Presentational bits and form-state shapes shared by the support pages.
//
// Not a route — only page/layout/route filenames are routable — so it is safe
// beside them. The form-state types live here rather than next to the Server
// Actions because a "use server" file may only export async functions, which
// is the same reason app/admin/feedback/ui.tsx holds NOTE_MAX.

/**
 * Status colour, and the second channel that goes with it.
 *
 * `dot` is set on the two live states and NOT on the finished one, which is
 * the rule in the design system: colour alone is not a status channel, and
 * "resolved" is the one state that is not still moving. Nothing here is
 * `brand` — status colour is never the brand colour.
 */
const STATUS_TONE: Record<string, { tone: Tone; dot: boolean }> = {
  OPEN: { tone: "info", dot: true },
  ANSWERED: { tone: "ok", dot: true },
  RESOLVED: { tone: "neutral", dot: false },
};

export function TicketStatus({ status }: { status: string }) {
  // A status written before this vocabulary existed still renders as itself
  // rather than as a blank pill.
  if (!isSupportStatus(status)) return <Badge tone="neutral">{status}</Badge>;
  const { tone, dot } = STATUS_TONE[status];
  return (
    <Badge tone={tone} dot={dot}>
      {SUPPORT_STATUS_INFO[status].customerLabel}
    </Badge>
  );
}

/**
 * There is a reply on this thread the customer has not opened.
 *
 * Deliberately its own pill rather than a third status: "we replied" and "you
 * have not read it" are different facts, and collapsing them would mean the
 * badge changed when they clicked, which reads as the status having changed.
 */
export function UnreadPill() {
  return (
    <Badge tone="brand" dot pulse>
      New reply
    </Badge>
  );
}

export type TicketFormState = { error: string | null };

export const TICKET_FORM_INITIAL: TicketFormState = { error: null };

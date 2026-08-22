import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { toneForUsage } from "@/components/ui/Progress";
import { Stat } from "@/components/ui/Stat";
import { formatCredits } from "./ledger";

/**
 * The self-imposed spending cap, rendered as STATUS only.
 *
 * Shared by /dashboard/billing and /dashboard/usage so the two can never
 * disagree about the one real limit on this account. It lives under billing/
 * because that is already where the credit vocabulary lives (ledger.ts).
 *
 * It deliberately does NOT contain the form. The form is owned by /settings
 * (app/(portal)/settings/SpendCapForm.tsx) and writes to User.spendCapCredits;
 * a second copy of a control that mutates the user record is exactly how two
 * screens end up disagreeing about what the cap is. Both callers link there.
 *
 * `spent` is passed in rather than fetched here because getSpendCapStatus skips
 * the spend query entirely when the user is uncapped, and both pages need the
 * figure either way.
 */
export function SpendCapPanel({ cap, spent }: { cap: number | null; spent: number }) {
  if (cap === null) {
    return (
      <Card>
        <CardHeader
          title="Spending cap"
          description="The only ceiling on this account is one you set yourself. There is no plan limit to run into."
          action={
            <ButtonLink href="/settings/credits" variant="secondary" size="sm">
              Set a cap
            </ButtonLink>
          }
        />
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          You haven&apos;t set one. With a cap, builds stop once you&apos;ve spent a number of
          credits you choose in any rolling 30-day period. You&apos;ve spent{" "}
          <span className="k-num font-medium text-ink">{formatCredits(spent)}</span> credits in the
          current window.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          Rolling, not monthly: each charge stops counting exactly 30 days after it happened, so
          there is no reset day and no cliff where the cap quietly stops protecting you mid-month.
        </p>
      </Card>
    );
  }

  const reached = spent >= cap;
  const remaining = Math.max(0, cap - spent);

  return (
    <Card>
      <CardHeader
        title="Spending cap"
        description="Your own ceiling on credits spent in any rolling 30-day period."
        action={
          <div className="flex items-center gap-2">
            {reached && (
              <Badge tone="warn" dot>
                Cap reached
              </Badge>
            )}
            <ButtonLink href="/settings/credits" variant="secondary" size="sm">
              Change cap
            </ButtonLink>
          </div>
        }
      />
      <div className="mt-5">
        <Stat
          label="Spent in the last 30 days"
          value={formatCredits(spent)}
          unit={`of ${formatCredits(cap)} credits`}
          bar={{ value: Math.min(spent, cap), max: cap }}
          tone={toneForUsage(cap > 0 ? spent / cap : 0)}
          detail={
            reached
              ? "Builds are paused until this drops below your cap, or until you change it. It's your cap — we never raise it for you."
              : `${formatCredits(remaining)} credits left under your cap. It's your cap — we never raise it for you.`
          }
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Rolling, not monthly: each charge stops counting exactly 30 days after it happened, so there
        is no reset day.
      </p>
    </Card>
  );
}

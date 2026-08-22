"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RewardStatus } from "@/app/api/rewards/_lib";
import { Button, buttonClass } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

// The free-credits section of /settings/credits. Renders nothing at all when
// no reward is configured — an unconfigured reward is not an error state to
// explain, it is simply a thing that does not exist yet.
//
// The UI does not pretend the four rewards are equivalent. Discord says
// "verified"; the other three say the credits are held for a few days, because
// that hold is the only thing standing in for a check. See
// app/api/rewards/social/_unverified.ts.
//
// Presentation only was moved onto the product design system when Settings was
// split into sections — every fetch, every state transition and every route
// this component calls is unchanged.

type Props = {
  rewards: RewardStatus[];
  holdHours: number;
  unlockHours: number;
  /** Outcome of a Discord round trip, from ?reward= on the callback redirect. */
  notice?: string;
};

const NOTICES: Record<string, { kind: "ok" | "error"; text: string }> = {
  discord_ok: { kind: "ok", text: "Discord verified — 50 credits added." },
  not_member: {
    kind: "error",
    text: "We couldn't find you in the Discord server. Join first, then try again.",
  },
  discord_taken: {
    kind: "error",
    text: "That Discord account has already claimed this reward on another Kodely account.",
  },
  already: { kind: "error", text: "You've already claimed that one." },
  too_new: { kind: "error", text: "Rewards unlock a day after signup." },
  paused: { kind: "error", text: "Reward claims are paused for a moment. Try again shortly." },
  unavailable: { kind: "error", text: "That reward isn't available right now." },
  failed: { kind: "error", text: "Couldn't confirm that with Discord. Try again." },
};

export default function RewardsCard({ rewards, holdHours, unlockHours, notice }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // No configured rewards, nothing to show. Not an empty state — no state.
  if (rewards.length === 0) return null;

  const banner = notice ? NOTICES[notice] : undefined;
  const earned = rewards
    .filter((r) => r.state === "claimed")
    .reduce((sum, r) => sum + r.credits, 0);
  const total = rewards.reduce((sum, r) => sum + r.credits, 0);

  async function post(url: string, body: unknown) {
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Couldn't reach the server. Try again.");
      return false;
    }
  }

  async function connect(platform: string) {
    const handle = (handles[platform] ?? "").trim();
    if (handle.length === 0) {
      setError("Enter your username first.");
      return;
    }
    setBusy(platform);
    await post("/api/rewards/social/connect", { platform, handle });
    setBusy(null);
  }

  async function claim(platform: string) {
    setBusy(platform);
    await post("/api/rewards/social/claim", { platform });
    setBusy(null);
  }

  return (
    <Card>
      <CardHeader
        title="Free credits"
        description={`Follow along and we'll top you up — ${rewards[0].credits} credits per platform, once per account.`}
        action={
          <span className="text-sm text-ink-2">
            <span className="k-num font-semibold text-ink">{earned}</span>
            <span className="k-num"> / {total}</span> claimed
          </span>
        }
      />

      {banner && (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-[0.8125rem] ${
            banner.kind === "ok" ? "bg-ok-tint text-ok" : "bg-danger-tint text-danger"
          }`}
        >
          {banner.text}
        </p>
      )}

      <ul className="mt-4 divide-y divide-hair">
        {rewards.map((reward) => (
          <li key={reward.platform} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-medium text-ink">{reward.label}</span>
                <span className="k-num text-sm text-ink-3">+{reward.credits}</span>
                {reward.verified && (
                  <Badge tone="info">verified automatically</Badge>
                )}
              </div>

              <Action
                reward={reward}
                holdHours={holdHours}
                unlockHours={unlockHours}
                busy={busy === reward.platform || pending}
                handle={handles[reward.platform] ?? ""}
                onHandle={(value) =>
                  setHandles((prev) => ({ ...prev, [reward.platform]: value }))
                }
                onConnect={() => connect(reward.platform)}
                onClaim={() => claim(reward.platform)}
              />
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-[0.8125rem] text-danger">{error}</p>}

      {/* Say the quiet part out loud rather than letting the delay look like a
          bug. The user is being told, accurately, why one reward is instant
          and the others are not. */}
      {rewards.some((r) => !r.verified) && (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          Only Discord can be checked automatically. The others go on your word, so those credits
          are held for {formatHours(holdHours)} first.
        </p>
      )}
    </Card>
  );
}

function Action({
  reward,
  holdHours,
  unlockHours,
  busy,
  handle,
  onHandle,
  onConnect,
  onClaim,
}: {
  reward: RewardStatus;
  holdHours: number;
  unlockHours: number;
  busy: boolean;
  handle: string;
  onHandle: (value: string) => void;
  onConnect: () => void;
  onClaim: () => void;
}) {
  const muted = "text-[0.8125rem] text-ink-3";
  const link =
    "k-focus rounded-xs text-[0.8125rem] text-ink-2 underline underline-offset-2 hover:text-ink hover:no-underline";

  if (reward.state === "claimed") {
    return (
      <Badge tone="ok" dot>
        Claimed
      </Badge>
    );
  }

  if (reward.state === "locked") {
    return <span className={muted}>Unlocks {unlockHours}h after signup</span>;
  }

  if (reward.state === "pending") {
    return (
      <span className={muted}>
        Connected — credits in {formatHours(reward.readyInHours ?? holdHours)}
      </span>
    );
  }

  if (reward.state === "claimable") {
    return (
      <Button variant="soft" size="sm" onClick={onClaim} loading={busy}>
        Claim {reward.credits}
      </Button>
    );
  }

  // state === "available"
  if (reward.verified) {
    return (
      <div className="flex items-center gap-3">
        <a href={reward.url} target="_blank" rel="noreferrer noopener" className={link}>
          Join
        </a>
        {/* A plain link, not fetch: this starts an OAuth redirect chain. */}
        <a href="/api/rewards/discord/start" className={buttonClass({ variant: "soft", size: "sm" })}>
          Verify
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={reward.url} target="_blank" rel="noreferrer noopener" className={link}>
        Open
      </a>
      <input
        value={handle}
        onChange={(e) => onHandle(e.target.value)}
        placeholder="your username"
        aria-label={`Your ${reward.label} username`}
        // `focus:outline-none` sat here alongside `k-focus` and cancelled the
        // very ring k-focus exists to draw — a control with a focus class and
        // no visible focus state.
        className="k-focus h-8 w-40 rounded-md border border-line-mid bg-surface px-3 text-[0.8125rem] text-ink placeholder:text-ink-3 focus:border-brand"
      />
      <Button variant="soft" size="sm" onClick={onConnect} loading={busy}>
        I followed
      </Button>
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours <= 1) return "under an hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "a day" : `${days} days`;
}

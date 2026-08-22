"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import type { MenuItem } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";

export type TopUpPack = { id: string; label: string };

// Mirrors CREDIT_PACKS in lib/stripe.ts. It stays here as a DEFAULT because
// some callers render <TopUpButton /> with no props; anywhere that can reach
// the server (the billing page does) should pass the real table instead so the
// labels can't drift from what checkout will charge.
const DEFAULT_PACKS: TopUpPack[] = [
  { id: "starter", label: "500 credits — $9" },
  { id: "builder", label: "2,500 credits — $40" },
  { id: "pro", label: "6,000 credits — $90" },
];

export type TopUpButtonProps = {
  /**
   * False when Stripe isn't configured on this deployment. Callers that can
   * gate on billingEnabled() do; the billing page renders regardless — a
   * statement is still worth reading with payments switched off. In that case
   * say so plainly rather than showing a button whose checkout call would come
   * back 503.
   */
  enabled?: boolean;
  packs?: TopUpPack[];
};

export default function TopUpButton({ enabled = true, packs = DEFAULT_PACKS }: TopUpButtonProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function buy(packId: string) {
    setLoading(true);
    try {
      const { url } = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ packId }),
      });
      // .assign() rather than assigning to .href: same navigation, but it is
      // a method call instead of a mutation of a value owned by the host.
      // No setLoading(false) — we are leaving the page.
      window.location.assign(url);
    } catch (err) {
      toast({
        tone: "danger",
        message: err instanceof ApiError ? err.message : "Couldn't start checkout.",
      });
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-ink-2">
        Top-ups aren&apos;t available right now — card payments aren&apos;t set up on this
        deployment. Your credits and everything on this page are unaffected.
      </p>
    );
  }

  // A menu rather than a row of buttons: the packs are one choice with three
  // answers, and three same-weight buttons read as three unrelated actions.
  const items: MenuItem[] = [
    { kind: "label", label: "Credit packs" },
    ...packs.map<MenuItem>((p) => ({
      kind: "item",
      label: p.label,
      onSelect: () => void buy(p.id),
      disabled: loading,
    })),
  ];

  return (
    <Menu
      align="end"
      items={items}
      trigger={(props) => (
        <Button
          {...props}
          type="button"
          variant="secondary"
          size="sm"
          loading={loading}
          icon={<CreditCard className="size-4" />}
        >
          Top up
        </Button>
      )}
    />
  );
}

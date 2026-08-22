"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, Search, Server, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

type DomainCheck = {
  domain: string;
  available: boolean;
  premium: boolean;
  priceCents: number | null;
  renewCents: number | null;
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number | null) => (cents == null ? "—" : USD.format(cents / 100));

/**
 * The buy-a-domain box. Debounced live availability + price from Nxeon while
 * the customer types — the same "show the real number before they commit"
 * rule the create-website credit estimate follows.
 */
function DomainBuy() {
  const [value, setValue] = useState("");
  // One request-tagged result rather than a separate `check`/`checking`
  // reset at the top of the effect — that pattern calls setState
  // synchronously in the effect body (a real cascading-render smell, not
  // just a lint rule) and it means three pieces of state can disagree for a
  // render. Comparing the id this effect is CURRENTLY asking about against
  // the id the last answer arrived for gives the same information with one
  // state slot and no reset.
  const [asked, setAsked] = useState(0);
  const [result, setResult] = useState<{ id: number; check: DomainCheck | null }>({
    id: -1,
    check: null,
  });
  const [buying, setBuying] = useState(false);
  const toast = useToast();
  const requestId = useRef(0);

  const checking = asked !== result.id;
  const check = checking ? null : result.check;

  useEffect(() => {
    const domain = value.trim().toLowerCase();
    if (domain.length < 4 || !domain.includes(".")) {
      // Too short to be a real query — settle immediately at "no result" so
      // `checking` reads false rather than stuck true from a prior attempt.
      const id = ++requestId.current;
      setAsked(id);
      setResult({ id, check: null });
      return;
    }

    const id = ++requestId.current;
    setAsked(id);
    const timer = setTimeout(async () => {
      let check: DomainCheck | null = null;
      try {
        const { result: r } = await api<{ result: DomainCheck | null }>(
          `/api/nxeon/domains?domain=${encodeURIComponent(domain)}`,
        );
        check = r;
      } catch {
        // A failed check settles as "no result" — the buy button below still
        // works, Nxeon's own checkout page prices and validates for real.
      }
      if (requestId.current === id) setResult({ id, check });
    }, 450);
    return () => clearTimeout(timer);
  }, [value]);

  async function buy() {
    setBuying(true);
    try {
      const { url } = await api<{ url: string }>("/api/nxeon/checkout", {
        method: "POST",
        body: JSON.stringify({ product: "domain", domain: value.trim().toLowerCase() }),
      });
      window.location.assign(url);
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiError ? err.message : "Couldn't start checkout." });
      setBuying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          label="Buy a domain through Nxeon"
          placeholder="example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hint={
            check
              ? check.available
                ? `Available — ${money(check.priceCents)} first year, ${money(check.renewCents)} to renew${check.premium ? " (premium name)" : ""}`
                : "Not available"
              : "Registered and billed through your Nxeon wallet, not Kodely credits."
          }
          error={check && !check.available ? "This one's taken — try another." : undefined}
        />
      </div>
      <Button
        variant="secondary"
        icon={checking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        disabled={!check?.available || buying}
        loading={buying}
        onClick={buy}
      >
        Buy domain
      </Button>
    </div>
  );
}

/** "Get a VPS" / "Get shared hosting" — no per-item pricing to show up front
    (Nxeon's own wizard does that), so these are single-click hand-offs. */
function ProductButton({
  product,
  label,
  icon,
}: {
  product: "vps" | "hosting";
  label: string;
  icon: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function go() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/nxeon/checkout", {
        method: "POST",
        body: JSON.stringify({ product }),
      });
      window.location.assign(url);
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiError ? err.message : "Couldn't start checkout." });
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" icon={icon} loading={busy} onClick={go}>
      {label}
    </Button>
  );
}

export function NxeonBuyPanel() {
  return (
    <div className="flex flex-col gap-5">
      <DomainBuy />
      <div className="flex flex-wrap gap-2">
        <ProductButton product="vps" label="Get a VPS" icon={<Server className="size-4" />} />
        <ProductButton product="hosting" label="Get shared hosting" icon={<ShoppingBag className="size-4" />} />
      </div>
    </div>
  );
}

export function NxeonBalance({ balanceCents }: { balanceCents: number | null }) {
  if (balanceCents == null) return null;
  return (
    <Badge tone="brand" dot>
      {money(balanceCents)} Nxeon wallet
    </Badge>
  );
}

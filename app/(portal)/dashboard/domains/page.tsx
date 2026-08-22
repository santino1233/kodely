import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Globe, Link2, PencilLine, Server, ShoppingBag, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nxeonEnabled, nxeonWallet } from "@/lib/nxeon";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ADDRESS_PATTERN, siteAddress, siteAddressLabel } from "./address";
import { CopyAddress } from "./CopyAddress";
import { NxeonBalance, NxeonBuyPanel } from "./NxeonPanel";

export const dynamic = "force-dynamic";

// Bare noun: the "— Kodely" suffix comes from the title template on
// app/(portal)/layout.tsx, so every portal tab reads the same way.
export const metadata: Metadata = { title: "Domains" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// The closed set of outcomes the Nxeon connect/callback routes redirect back
// with. Hardened against prototype pollution the same way every other
// portal searchParams switch in this codebase is: hasOwnProperty, never `in`.
const NXEON_NOTICES: Record<string, { tone: "ok" | "danger"; message: string }> = {
  linked: { tone: "ok", message: "Your Nxeon account is connected." },
  error: { tone: "danger", message: "That didn't go through — try connecting again." },
  unavailable: { tone: "danger", message: "Nxeon isn't set up on this deployment yet." },
  already_linked_elsewhere: {
    tone: "danger",
    message: "That Nxeon account is already connected to a different Kodely account.",
  },
};

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout redirects too, but a layout does not re-render on every
  // navigation inside its own segment — every page under it resolves the user
  // itself. Same reasoning as app/(portal)/layout.tsx.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rawNotice = (await searchParams).nxeon;
  const noticeKey = typeof rawNotice === "string" ? rawNotice : "";
  const notice =
    Object.prototype.hasOwnProperty.call(NXEON_NOTICES, noticeKey) ? NXEON_NOTICES[noticeKey] : null;

  // The wallet call touches Nxeon's live API, so it is skipped entirely
  // whenever the integration is unconfigured OR this account was never
  // linked — an unlinked user has no nxeonUserId to ask about.
  const walletFetch =
    nxeonEnabled() && user.nxeonUserId
      ? nxeonWallet(user.nxeonUserId).catch(() => null)
      : Promise.resolve(null);

  const [headerList, projects, wallet] = await Promise.all([
    headers(),
    db.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, publishedAt: true },
    }),
    walletFetch,
  ]);

  const host = headerList.get("host") ?? "";

  // Live sites first — this page is read to find an address to hand somebody,
  // and the ones that resolve today are the ones being looked for.
  const sites = [...projects].sort((a, b) => {
    const aLive = a.publishedAt !== null;
    const bLive = b.publishedAt !== null;
    if (aLive !== bLive) return aLive ? -1 : 1;
    return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  });

  const live = sites.filter((s) => s.publishedAt !== null).length;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader as="h1"
        title="Domains"
        description={
          sites.length === 0 ? (
            "Every site you build gets its own web address, free and with HTTPS. Nothing to buy and nothing to configure."
          ) : (
            <>
              <span className="k-num">{sites.length}</span>{" "}
              {sites.length === 1 ? "site" : "sites"}, <span className="k-num">{live}</span> of them
              live right now. Every address below is permanent — HTTPS included, nothing to buy and
              nothing to configure.
            </>
          )
        }
      />

      {notice && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-ok/30 bg-ok-tint text-ok"
              : "border-danger/30 bg-danger-tint text-danger"
          }`}
        >
          {notice.message}
        </div>
      )}

      {sites.length === 0 ? (
        <EmptyState
          kind="empty"
          icon={<Globe className="size-7" aria-hidden />}
          title="No addresses yet"
          body="An address is reserved the moment you create a site, and goes live the moment you publish it."
          action={
            <ButtonLink href="/dashboard/new" variant="primary" icon={<Sparkles className="size-4" aria-hidden />}>
              Create a website
            </ButtonLink>
          }
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-hair">
            {sites.map((site) => {
              const url = siteAddress(host, site.slug);
              const label = siteAddressLabel(host, site.slug);
              const published = site.publishedAt !== null;

              return (
                <li
                  key={site.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{site.name}</p>
                      {published ? (
                        <Badge tone="ok" dot>
                          Live
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>
                          Draft
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1 truncate font-mono text-[0.8125rem] text-ink-2" title={label}>
                      {label}
                    </p>

                    <p className="mt-1 text-xs text-ink-3">
                      {published && site.publishedAt != null ? (
                        <>
                          Published <span className="k-num">{DATE.format(site.publishedAt)}</span>
                        </>
                      ) : (
                        "Reserved. This exact address goes live when you publish — it does not 404 by mistake, it simply is not serving anything yet."
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <CopyAddress url={url} siteName={site.name} />
                    {published ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                        <span>Open</span>
                      </a>
                    ) : null}
                    <ButtonLink
                      href={`/projects/${site.id}`}
                      variant="ghost"
                      size="sm"
                      icon={<PencilLine className="size-3.5" aria-hidden />}
                    >
                      {published ? "Edit" : "Publish"}
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your address never changes"
          description="Worth knowing before you rename anything."
        />
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            The address comes from a slug picked once, when the site is created, from the name it
            had at that moment — <span className="font-mono text-ink">{ADDRESS_PATTERN}</span>.
            Renaming a site changes what your dashboard calls it and nothing else.
          </p>
          <p>
            That is deliberate. If renaming moved the address, every link, share, QR code and
            search result pointing at the old one would break with no redirect to catch it — and
            the address you vacated would go back into the pool for someone else to claim, from an
            action that looked purely cosmetic.
          </p>
          <p>
            If you want a different address, make a copy of the site from the builder. The copy
            gets its own new address and the original keeps its links.
          </p>
        </div>
      </Card>

      {nxeonEnabled() ? (
        <NxeonSection linked={!!user.nxeonUserId} balanceCents={wallet?.balanceCents ?? null} user={user} />
      ) : (
        <div>
          <EmptyState
            kind="unavailable"
            icon={<Link2 className="size-7" aria-hidden />}
            title="Custom domains are not supported yet"
            body="You cannot point your own domain at a Kodely site today. There is no connect step hidden behind a setting — the feature does not exist, so there is nothing here to fill in."
          />

          <Card className="mt-4">
            <CardHeader
              title="What that means for you today"
              description="Said plainly, so you can plan around it."
            />
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
                <span>
                  If your business needs to be reachable at your own domain right now, Kodely is the
                  wrong tool for that part of the job. We would rather say so than have you find out
                  after you have built the site.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
                <span>
                  Most registrars offer URL forwarding, which sends visitors from your domain to your
                  Kodely address. It works, but the Kodely address is what shows in the browser bar
                  afterwards — it is a signpost, not your domain hosting the site.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
                <span>
                  Your current address is not a placeholder that gets thrown away later. It is a real
                  address on a real certificate, and anything you publish there stays there.
                </span>
              </li>
            </ul>

            <div className="mt-6 border-t border-hair pt-5">
              <p className="k-label">What custom domains will need</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">
                <li>
                  A place to record the domain against your site, and the check that proves you own
                  it before we serve anything on it.
                </li>
                <li>
                  Certificate issuance and renewal for every customer domain, running unattended —
                  the part that quietly breaks in ninety days if it is not built properly.
                </li>
                <li>
                  A change to which hostnames are allowed to serve your pages. That list is currently
                  three fixed shapes, and it is a security control, not a config value: it is what
                  stops one customer&apos;s site being served on another&apos;s address.
                </li>
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                None of that is started. When it is, it will appear on this page.{" "}
                {/* ?topic=feature — the same parameter the rail's "Request a
                    feature" item uses, so the support form arrives already
                    knowing what kind of message this is. */}
                <Link
                  href="/support?topic=feature"
                  className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
                >
                  Tell us if you need it
                </Link>{" "}
                — it is the most useful thing you can do to move it up the list.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

type NxeonUserFields = {
  nxeonDomain: string | null;
  nxeonDomainExpiresAt: Date | null;
  nxeonServerId: string | null;
  nxeonServerIp: string | null;
  nxeonServerHostname: string | null;
  nxeonHostingAccountId: string | null;
  nxeonHostingDomain: string | null;
};

/**
 * The real Nxeon section. Two states — connect, or manage — plus a fact list
 * of whatever Nxeon's webhook has already told us was provisioned.
 *
 * THE HONESTY LINE THIS SECTION MUST NOT CROSS: buying a domain here
 * registers it with Nxeon and adds it to the shared wallet. It does NOT point
 * that domain at a Kodely site — no DNS record connecting the two is written
 * by anything in this codebase. Provisioning a VPS or hosting account here
 * does NOT deploy the Kodely-built site onto it either; nothing ships
 * generated files to Nxeon infrastructure today. Both facts are stated
 * in-page, not buried in a tooltip, because a customer who buys a domain
 * expecting their site to move is the worst possible outcome of this feature.
 */
function NxeonSection({
  linked,
  balanceCents,
  user,
}: {
  linked: boolean;
  balanceCents: number | null;
  user: NxeonUserFields;
}) {
  const facts: { label: string; value: string }[] = [];
  if (user.nxeonDomain) {
    facts.push({
      label: "Domain registered via Nxeon",
      value: user.nxeonDomainExpiresAt
        ? `${user.nxeonDomain} — renews ${DATE.format(user.nxeonDomainExpiresAt)}`
        : user.nxeonDomain,
    });
  }
  if (user.nxeonServerIp) {
    facts.push({
      label: "VPS via Nxeon",
      value: user.nxeonServerHostname
        ? `${user.nxeonServerHostname} (${user.nxeonServerIp})`
        : user.nxeonServerIp,
    });
  }
  if (user.nxeonHostingDomain || user.nxeonHostingAccountId) {
    facts.push({
      label: "Shared hosting via Nxeon",
      value: user.nxeonHostingDomain ?? `Account ${user.nxeonHostingAccountId}`,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Domains, VPS & hosting via Nxeon"
        description="A separate account and a separate wallet from your Kodely credits."
        action={linked ? <NxeonBalance balanceCents={balanceCents} /> : undefined}
      />

      {!linked ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-lg text-sm leading-relaxed text-ink-2">
            Connect your Nxeon account — or create one on the spot — to buy a real domain, a VPS,
            or shared hosting. You pay Nxeon directly, from a wallet Kodely never touches.
          </p>
          <ButtonLink href="/api/nxeon/connect" variant="primary" icon={<Server className="size-4" aria-hidden />}>
            Connect Nxeon
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {facts.length > 0 && (
            <ul className="flex flex-col gap-2 rounded-lg border border-hair bg-surface-2/40 p-3 text-sm">
              {facts.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-3">
                  <span className="text-ink-2">{f.label}</span>
                  <span className="k-num font-medium text-ink">{f.value}</span>
                </li>
              ))}
            </ul>
          )}
          <NxeonBuyPanel />
        </div>
      )}

      <div className="mt-6 border-t border-hair pt-5">
        <p className="k-label">What this does not do</p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">
          <li className="flex gap-2">
            <ShoppingBag className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              Buying a domain here does not point it at your Kodely site. Nxeon hands you a real,
              working domain — connecting it to <span className="font-mono">{ADDRESS_PATTERN}</span>{" "}
              is a DNS step you take yourself, the same as pointing any domain anywhere.
            </span>
          </li>
          <li className="flex gap-2">
            <Server className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              A VPS or hosting account from Nxeon does not receive your Kodely-built site
              automatically. Nothing here deploys generated files onto Nxeon infrastructure yet —
              what you get is a real server or hosting account, empty, ready for you to use however
              you like.
            </span>
          </li>
        </ul>
      </div>
    </Card>
  );
}

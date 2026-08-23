import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CircleCheck,
  CircleX,
  CreditCard,
  FilePlus2,
  Globe,
  Home,
  LayoutTemplate,
  Rocket,
  Settings,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { averageBuildCredits, getBalance, getSpendCapStatus } from "@/lib/credits";
import { db } from "@/lib/db";
import { EVENTS } from "@/lib/events";
import { billingEnabled } from "@/lib/stripe";
import { WebsiteCard } from "@/components/app/WebsiteCard";
import { Badge } from "@/components/ui/Badge";
import type { Tone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHero } from "@/components/ui/PageHero";
import { Progress } from "@/components/ui/Progress";
import { Stat } from "@/components/ui/Stat";
import FirstRunChecklist from "@/components/onboarding/FirstRunChecklist";
import TopUpButton from "./TopUpButton";
import { daysAgo, formatRelative, loadWebsites } from "./websites/data";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
export const metadata: Metadata = { title: "Dashboard" };

/** Cards on the home page. The full list lives at /dashboard/websites. */
const RECENT_SITES = 3;
const ACTIVITY_LIMIT = 8;
const FAILURE_WINDOW_DAYS = 7;

/* The five event names that describe something the CUSTOMER did or had happen
   to them. The rest of the vocabulary in lib/events.ts is analytics
   (build.started, credits.exhausted, billing.checkout_started…) and reads as
   noise in a personal timeline. */
const ACTIVITY_NAMES: string[] = [
  EVENTS.projectCreated,
  EVENTS.buildSucceeded,
  EVENTS.buildFailed,
  EVENTS.sitePublished,
  EVENTS.projectDeleted,
];

type ActivityMeta = { verb: string; tone: Tone; Icon: LucideIcon };

const ACTIVITY_META: Record<string, ActivityMeta> = {
  [EVENTS.projectCreated]: { verb: "Created", tone: "brand", Icon: FilePlus2 },
  [EVENTS.buildSucceeded]: { verb: "Build finished for", tone: "ok", Icon: CircleCheck },
  [EVENTS.buildFailed]: { verb: "Build failed for", tone: "danger", Icon: CircleX },
  [EVENTS.sitePublished]: { verb: "Published", tone: "ok", Icon: Rocket },
  [EVENTS.projectDeleted]: { verb: "Deleted", tone: "neutral", Icon: Trash2 },
};

/**
 * `Event.props` is untyped Json written by a dozen call sites.
 * `hasOwnProperty.call`, never `in` — `in` walks the prototype chain, so a row
 * whose props happened to be `{}` would still "have" `constructor`.
 */
function readProjectId(props: unknown): string | null {
  if (props === null || typeof props !== "object" || Array.isArray(props)) return null;
  if (!Object.prototype.hasOwnProperty.call(props, "projectId")) return null;
  const value = (props as Record<string, unknown>).projectId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaFor(name: string): ActivityMeta | null {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_META, name) ? ACTIVITY_META[name] : null;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const failureSince = daysAgo(FAILURE_WINDOW_DAYS);

  const [balance, avgBuildCredits, sites, totalSites, publishedSites, cap, events, failures] =
    await Promise.all([
      getBalance(user.id),
      averageBuildCredits(user.id),
      loadWebsites(user.id, { take: RECENT_SITES }),
      db.project.count({ where: { userId: user.id } }),
      db.project.count({ where: { userId: user.id, publishedAt: { not: null } } }),
      getSpendCapStatus(user.id),
      // Served straight off Event's @@index([userId, createdAt]) — the same
      // shape app/admin/users/[id]/page.tsx uses.
      db.event.findMany({
        where: { userId: user.id, name: { in: ACTIVITY_NAMES } },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: { id: true, name: true, props: true, createdAt: true },
      }),
      db.build.findMany({
        where: { project: { userId: user.id }, status: "FAILED", createdAt: { gte: failureSince } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true, project: { select: { id: true, name: true } } },
      }),
    ]);

  // Event.props carries a projectId but NOT the project's name, so the name has
  // to be joined. A DELETED project has nothing left to join to — which is why
  // the renderer below never prints an id and never assumes a name exists.
  const referenced = [...new Set(events.map((e) => readProjectId(e.props)).filter((id): id is string => id !== null))];
  const named = referenced.length
    ? await db.project.findMany({
        where: { id: { in: referenced }, userId: user.id },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(named.map((p) => [p.id, p.name]));

  const displayName = user.name?.trim() || user.email.split("@")[0];
  const buildsLeft = Math.floor(balance / Math.max(1, avgBuildCredits));
  const canTopUp = billingEnabled();
  const failure = failures[0] ?? null;

  // "Does anything need attention" — only ever things that are true right now.
  const alerts: { id: string; tone: "danger" | "warn"; title: string; body: string; href: string; cta: string }[] = [];
  if (balance <= 0) {
    alerts.push({
      id: "empty",
      tone: "danger",
      title: "You're out of credits",
      body: "Builds need credits to run. Your sites stay online and nothing has been lost.",
      href: "/dashboard/billing",
      cta: "Top up",
    });
  } else if (buildsLeft < 1) {
    alerts.push({
      id: "low",
      tone: "warn",
      title: "Not enough credits for another full build",
      body: `You have ${balance.toLocaleString()}, and your recent builds have averaged ${avgBuildCredits.toLocaleString()} credits each.`,
      href: "/dashboard/billing",
      cta: "Top up",
    });
  }
  if (cap.reached && cap.cap !== null) {
    alerts.push({
      id: "cap",
      tone: "warn",
      title: "You've hit your own spend cap",
      body: `${cap.spent.toLocaleString()} of ${cap.cap.toLocaleString()} credits spent in the last 30 days. Builds stay paused until the rolling window clears or you raise the cap.`,
      href: "/settings/credits",
      cta: "Review cap",
    });
  }
  if (failure) {
    alerts.push({
      id: "failed",
      tone: "warn",
      title: `A build failed on ${failure.project.name}`,
      body: `${formatRelative(failure.createdAt)}. Failed builds are never charged — open the site and try again.`,
      href: `/projects/${failure.project.id}`,
      cta: "Open site",
    });
  }

  return (
    <>
      {/* ── Welcome. The dashboard's one liquid-glass hero. ───────────────── */}
      <PageHero
        icon={<Home className="size-5" aria-hidden />}
        title={`Welcome back, ${displayName}`}
        description="Describe what you want and Kodely builds a real site for it. Everything you make lives here."
        action={
          <dl className="k-num flex shrink-0 gap-6 sm:gap-8">
            <div>
              <dt className="k-label">Sites</dt>
              <dd className="mt-1.5 text-xl font-semibold text-ink">{totalSites}</dd>
            </div>
            <div>
              <dt className="k-label">Published</dt>
              <dd className="mt-1.5 text-xl font-semibold text-ink">{publishedSites}</dd>
            </div>
            <div>
              <dt className="k-label">Credits</dt>
              <dd className="mt-1.5 text-xl font-semibold text-ink">{balance.toLocaleString()}</dd>
            </div>
          </dl>
        }
      >
        {/* ONE create path. There used to be a second, secondary "New site"
            button here that made a blank project and dropped the customer
            straight into the builder — two buttons, one job, and the
            quieter one led to the emptier screen. */}
        <ButtonLink href="/dashboard/new" variant="primary" size="lg">
          Create Website
        </ButtonLink>
      </PageHero>

      <div className="mt-6">
        {/* Renders nothing once they've published — reaching the North Star is
            the exit condition, so there is no flag to store or reset. */}
        <FirstRunChecklist />
      </div>

      {/* ── Anything genuinely wrong, said before they go looking. ────────── */}
      {alerts.length > 0 && (
        <section aria-label="Needs your attention" className="mt-6 space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={[
                "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3",
                alert.tone === "danger"
                  ? "border-danger/25 bg-danger-tint"
                  : "border-warn/25 bg-warn-tint",
              ].join(" ")}
            >
              <TriangleAlert
                aria-hidden
                className={`size-4 shrink-0 ${alert.tone === "danger" ? "text-danger" : "text-warn"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-ink">{alert.title}</p>
                <p className="k-num mt-0.5 text-xs leading-relaxed text-ink-2">{alert.body}</p>
              </div>
              <ButtonLink href={alert.href} variant="secondary" size="sm" className="shrink-0">
                {alert.cta}
              </ButtonLink>
            </div>
          ))}
        </section>
      )}

      {/* ── What have I built ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionHeader
          title="Your websites"
          description={
            totalSites > RECENT_SITES
              ? `Your ${RECENT_SITES} most recently updated of ${totalSites}.`
              : undefined
          }
          action={
            totalSites > 0 ? (
              <ButtonLink
                href="/dashboard/websites"
                variant="ghost"
                size="sm"
                iconRight={<ArrowRight className="size-4" />}
              >
                View all
              </ButtonLink>
            ) : undefined
          }
        />

        {sites.length === 0 ? (
          /* No action of its own: the page's one primary — "Create Website" —
             is in the panel directly above this, and a second button pointing
             at the same route is the redundancy that got the old portal into
             trouble. The copy names it instead. */
          <EmptyState
            kind="empty"
            icon={<Globe className="size-8" aria-hidden />}
            title="Nothing built yet"
            body="Press Create Website above and describe what you want on it. It takes a couple of minutes and you already have the credits for it."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <li key={site.id} className="flex">
                <WebsiteCard project={site} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── How am I doing on credits · what just happened ────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Credits"
            description="Credits never expire. There is no monthly allowance and no reset date."
            action={canTopUp ? <TopUpButton /> : undefined}
          />

          <div className="mt-5 grid grid-cols-2 gap-6">
            <Stat
              label="Remaining"
              value={balance.toLocaleString()}
              unit="credits"
              detail={
                balance <= 0
                  ? "Out of credits"
                  : buildsLeft < 1
                    ? "Not enough for another full build"
                    : `About ${buildsLeft} more ${buildsLeft === 1 ? "build" : "builds"}`
              }
            />
            <Stat
              label="Typical build"
              value={avgBuildCredits.toLocaleString()}
              unit="credits"
              detail="Averaged from your own recent successful builds"
            />
          </div>

          <div className="mt-5 border-t border-hair pt-4">
            {cap.cap === null ? (
              <p className="text-xs leading-relaxed text-ink-3">
                No spend cap set.{" "}
                <Link href="/settings/credits" className="k-focus rounded-xs text-brand hover:underline">
                  Set one in Settings
                </Link>{" "}
                to put a ceiling on what a long session can cost.
              </p>
            ) : (
              <>
                <div className="k-num flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-ink-2">Spend cap · rolling 30 days</span>
                  <span className="text-ink">
                    {cap.spent.toLocaleString()} / {cap.cap.toLocaleString()}
                  </span>
                </div>
                <Progress
                  className="mt-2"
                  size="sm"
                  value={cap.spent}
                  max={cap.cap}
                  label="Credits spent against your spend cap"
                />
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description={`The last ${ACTIVITY_LIMIT} things that happened on your account.`}
          />

          {events.length === 0 ? (
            <EmptyState
              kind="empty"
              className="mt-4"
              icon={<Activity className="size-6" aria-hidden />}
              title="Nothing yet"
              body="Creating, building and publishing a site all show up here."
            />
          ) : (
            <ol className="mt-4 space-y-3">
              {events.map((event) => {
                const meta = metaFor(event.name);
                if (!meta) return null;
                const projectId = readProjectId(event.props);
                const name = projectId === null ? undefined : nameById.get(projectId);
                const { Icon } = meta;

                // Three cases, and none of them prints a raw id:
                //  · a delete has no row left to join to, ever
                //  · a live project resolves to a name and a link
                //  · anything else was deleted after the event was recorded
                let subject: ReactNode;
                if (event.name === EVENTS.projectDeleted) {
                  subject = <span className="text-ink-2">a site</span>;
                } else if (name !== undefined && projectId !== null) {
                  subject = (
                    <Link
                      href={`/projects/${projectId}`}
                      className="k-focus rounded-xs font-medium text-ink hover:text-brand"
                    >
                      {name}
                    </Link>
                  );
                } else {
                  subject = <span className="text-ink-3">a site that&rsquo;s no longer here</span>;
                }

                return (
                  <li key={event.id} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={[
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                        meta.tone === "ok"
                          ? "bg-ok-tint text-ok"
                          : meta.tone === "danger"
                            ? "bg-danger-tint text-danger"
                            : meta.tone === "brand"
                              ? "bg-brand-tint text-brand"
                              : "bg-surface-2 text-ink-3",
                      ].join(" ")}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-2">
                      {meta.verb} {subject}
                      <span className="k-num block text-xs text-ink-3">
                        <time dateTime={event.createdAt.toISOString()}>
                          {formatRelative(event.createdAt)}
                        </time>
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {/* ── Quick actions. Only routes that exist today. ──────────────────── */}
      <section className="mt-8">
        <h2 className="k-label">Quick actions</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              href: "/dashboard/templates",
              label: "Browse starter prompts",
              body: "Written briefs you can build from instead of starting at a blank box.",
              Icon: LayoutTemplate,
            },
            {
              href: "/dashboard/billing",
              label: canTopUp ? "Billing & credits" : "Credit statement",
              body: "Every credit in and out, with the build each charge came from.",
              Icon: CreditCard,
            },
            {
              href: "/settings",
              label: "Settings",
              body: "Your name, your sessions, and your rolling 30-day spend cap.",
              Icon: Settings,
            },
          ].map((action) => (
            <li key={action.href} className="flex">
              <Card interactive className="relative w-full">
                <action.Icon aria-hidden className="size-4 text-ink-3" />
                <Link
                  href={action.href}
                  className="k-focus mt-3 block rounded-xs text-sm font-medium text-ink after:absolute after:inset-0 after:content-['']"
                >
                  {action.label}
                </Link>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{action.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* One honest note about what the numbers above are and are not. */}
      <p className="mt-8 border-t border-hair pt-4 text-xs leading-relaxed text-ink-3">
        Kodely sells credit packs, not a subscription — there is no plan, no renewal date and no
        monthly allowance. Credits never expire, and a build that fails is never charged.{" "}
        {publishedSites > 0 && (
          <>
            Published sites are served from Kodely at their own address.{" "}
            <Badge tone="neutral">Custom domains aren&rsquo;t built yet</Badge>
          </>
        )}
      </p>
    </>
  );
}

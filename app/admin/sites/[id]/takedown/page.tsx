import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, recordAdminAction } from "@/lib/admin-audit";
import { takeDownSite } from "../../actions";
import {
  CacheCaveat,
  Notice,
  TAKEDOWN_REASONS,
  buttonClass,
  formatDateTime,
  siteHost,
  truncate,
} from "../../ui";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function AdminSiteTakedownPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — see app/admin/page.tsx. The action behind this form
  // re-checks the same thing, because a Server Function is reachable by direct
  // POST without this page ever rendering.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;
  const error = first((await searchParams).error);

  // Its own read, recorded on its own. This is a separate page from the detail
  // view and it renders the owner's email address before anything has been
  // decided, so arriving here — even to cancel — is an access to customer data.
  await recordAdminAction(admin, ADMIN_ACTIONS.siteViewed, {
    targetType: ADMIN_TARGET_TYPES.project,
    targetId: id,
  });

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      publishedAt: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!project) notFound();

  const [servedFiles, unreviewed, findingTotal] = await Promise.all([
    db.projectFile.count({ where: { projectId: id, published: true, kind: "build" } }),
    db.moderationFinding.count({ where: { projectId: id, reviewedAt: null } }),
    db.moderationFinding.count({ where: { projectId: id } }),
  ]);

  const host = siteHost(project.slug);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <Link
          href={`/admin/sites/${project.id}`}
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← {truncate(project.slug, 40)}
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Take this site offline</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          <span className="font-mono text-xs">{host}</span> · {truncate(project.name, 44)} ·{" "}
          <Link
            href={`/admin/users/${project.user.id}`}
            className="underline-offset-4 hover:underline"
          >
            {project.user.email}
          </Link>
        </p>
      </div>

      {project.publishedAt === null ? (
        <>
          <Notice title="Already offline" tone="neutral">
            <span className="font-mono text-xs">{host}</span> is not resolving —{" "}
            <span className="font-mono">publishedAt</span> is already null. There is nothing to take
            down.
          </Notice>
          <Link href={`/admin/sites/${project.id}`} className={`mt-6 inline-block ${buttonClass()}`}>
            Back to the site
          </Link>
        </>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-black/10 p-5 text-sm dark:border-white/10">
            <h2 className="text-sm font-medium">What this does, exactly</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-black/70 dark:text-white/70">
              <li>
                Sets <span className="font-mono">Project.publishedAt</span> to null. That is the only
                write.{" "}
                <span className="font-mono">app/api/site/[slug]/[[...path]]</span> answers 404 to
                every path once it is null — pages, assets, and the synthesised{" "}
                <span className="font-mono">robots.txt</span> and{" "}
                <span className="font-mono">sitemap.xml</span> alike.
              </li>
              <li>
                <strong>Nothing is deleted.</strong> The {servedFiles} published file(s) stay in the
                database, the owner&apos;s draft tree and Vite sources are untouched, the project
                keeps its name and its slug, and the account is not affected in any way.
              </li>
              <li>
                <strong>The owner can put it back.</strong> Publishing again from their project page
                republishes the same slug. That republish re-runs the secret scan and the moderation
                gate, so a <span className="font-mono">high</span>-severity finding will refuse it on
                its own — but nothing here bars them from trying.
              </li>
              <li>
                It also counts as a new publish against their 24-hour publish rate limit
                (<span className="font-mono">lib/rate-limit.ts</span>), because the limit counts
                projects with a recent <span className="font-mono">publishedAt</span> and this
                clears theirs.
              </li>
              <li>
                <strong>The owner is not notified.</strong> Nothing emails them and nothing on their
                dashboard explains why; the project simply shows as unpublished again. If they should
                hear about it, that is a separate message you send.
              </li>
            </ul>
          </div>

          {/* The same component the registry, the detail page and the
              post-takedown confirmation use — one wording, one max-age, so a
              change to the site route's Cache-Control cannot leave three
              slightly different promises behind in three places. */}
          <div className="mb-6">
            <CacheCaveat />
          </div>

          {findingTotal > 0 && unreviewed > 0 ? (
            <div className="mb-6">
              <Notice tone="warn" title={`${unreviewed} finding(s) on this site are still unruled`}>
                Marking them true or false positive before you take the site down is what turns this
                takedown into a data point about the rules rather than just an outcome.
              </Notice>
            </div>
          ) : null}

          {error === "slug" ? (
            <div className="mb-6">
              <Notice tone="bad" title="That did not match">
                The confirmation text has to be the slug exactly:{" "}
                <span className="font-mono">{project.slug}</span>. Nothing was changed.
              </Notice>
            </div>
          ) : error === "reason" ? (
            <div className="mb-6">
              <Notice tone="bad" title="Pick a reason">
                A takedown has to say why — it is what the audit log records. Nothing was changed.
              </Notice>
            </div>
          ) : null}

          <form
            action={takeDownSite}
            className="rounded-xl border border-red-500/40 bg-red-500/5 p-5"
          >
            <input type="hidden" name="projectId" value={project.id} />

            <label htmlFor="reason" className="block text-sm font-medium">
              Why
            </label>
            <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
              Recorded in <span className="font-mono">AdminAuditLog</span>. A closed list on purpose
              — that log is documented as non-PII context, so the reporter&apos;s details and the
              narrative belong in the report thread, not here.
            </p>
            <select
              id="reason"
              name="reason"
              required
              defaultValue=""
              className="mt-2 w-full max-w-sm rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
            >
              <option value="" disabled>
                Choose a reason…
              </option>
              {Object.entries(TAKEDOWN_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label htmlFor="confirmSlug" className="mt-6 block text-sm font-medium">
              Type <span className="font-mono">{project.slug}</span> to confirm
            </label>
            <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
              Checked on the server, not just here. Published since{" "}
              {formatDateTime(project.publishedAt)}.
            </p>
            <input
              id="confirmSlug"
              name="confirmSlug"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder={project.slug}
              aria-label={`Type ${project.slug} to confirm takedown`}
              className="mt-2 w-full max-w-sm rounded-xl border border-black/10 bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-black/25 focus:border-black/30 dark:border-white/10 dark:placeholder:text-white/25 dark:focus:border-white/30"
            />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="submit" className={buttonClass("bad")}>
                Take {project.slug} offline
              </button>
              <Link
                href={`/admin/sites/${project.id}`}
                className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
              >
                Cancel
              </Link>
            </div>
          </form>

          <p className="mt-6 text-xs text-black/50 dark:text-white/50">
            This panel has no delete. Removing a project outright is the owner&apos;s action, from
            their own dashboard.
          </p>
        </>
      )}
    </div>
  );
}

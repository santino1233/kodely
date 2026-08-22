import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scanForSecrets } from "@/lib/secret-scan";
import { blockingFindings, moderateForPublish, recordModerationFindings } from "@/lib/moderation";
import { checkPublishRateLimit } from "@/lib/rate-limit";
import { track, EVENTS } from "@/lib/events";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// Publishing snapshots the draft tree onto the published tree. Deliberately
// NOT deploying to real Nxeon hosting infra in Phase 1 — that provisioner is
// still gated (see the Nxeon shared-hosting security review), so *.kodely.site
// is served straight out of this app from the published rows.
//
// The *.kodely.site wildcard's nginx block only routes to the PROD app
// (port 3000) — there is no separate wildcard for staging. A project
// published from staging would otherwise return a *.kodely.site URL that
// resolves through prod's app against prod's database, where the slug
// doesn't exist. Deriving the mode from the request's own Host header (never
// touches DNS, nginx, or .env) means staging always gets a URL that resolves
// against itself.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    include: {
      files: { where: { published: false, kind: "build" } },
    },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  // ── Kill switch ──────────────────────────────────────────────────────────
  // After the project lookup (an unknown or someone else's project still 404s)
  // and ahead of everything that follows: the publish rate limit, the secret
  // scan, moderation, and the transaction that copies the build tree onto the
  // published rows. That transaction is the moment the files become reachable
  // at *.kodely.site, so this is the one gate that has to hold when the switch
  // exists precisely because something abusive is already public.
  //
  // Ahead of the "nothing to publish yet" 400 as well. Both answers are true
  // when both apply, and during an incident the switch is the more useful of
  // the two — it tells the user the state of the world rather than the state
  // of their draft.
  //
  // Subject: user.id. The table hands this one no subject, but the project
  // owner is right here and passing them is strictly better — it is what makes
  // any rolloutPct below 100 a stable per-user split instead of a full shed
  // (see the `if (!userId) return false` note in lib/flags.ts). At the only
  // setting a kill switch should ever be operated at — 100%, toggled with
  // `enabled` — it changes nothing.
  if (!(await isEnabled(FLAGS.publishing, user.id))) {
    return Response.json(
      {
        error:
          "Publishing is paused right now while we work through an issue. Your site is saved and nothing has changed — try publishing again shortly.",
      },
      { status: 503 },
    );
  }

  if (project.files.length === 0) {
    return Response.json({ error: "Nothing to publish yet — generate a site first." }, { status: 400 });
  }

  // Only gate genuinely new subdomains — republishing an already-live project
  // isn't the spam-farming vector this protects against.
  if (!project.publishedAt) {
    const rateLimit = await checkPublishRateLimit(user.id);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "You've published a lot of new sites today — try again tomorrow." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  }

  // Scan both the compiled output (what's actually served) and the source
  // (a comment or string that got stripped by the build can still leak if
  // someone reads it another way) — belt and suspenders, cheap either way.
  const sourceFiles = await db.projectFile.findMany({
    where: { projectId: id, published: false, kind: "source" },
  });
  const publishable = [...project.files, ...sourceFiles].map((f) => ({
    path: f.path,
    content: f.content,
  }));

  const leaks = scanForSecrets(publishable);
  if (leaks.length > 0) {
    const { path, kind } = leaks[0];
    return Response.json(
      { error: `Publishing blocked: found what looks like a real secret in ${path} (${kind}). Remove it and try again.` },
      { status: 400 },
    );
  }

  // Abuse check. Same last-gate position as the secret scan, for the same
  // reason: after this line the files are reachable at *.kodely.site by anyone,
  // and a phishing clone hosted there is Kodely's abuse report to answer.
  //
  // moderateForPublish returns SIGNALS, not a verdict (see lib/moderation.ts) —
  // policy is applied right here, and only `high` refuses. Everything below
  // `high` is expected to be mostly benign (an integration logo, a mock login
  // UI) and must not stand between a legitimate user and their own site.
  const moderation = await moderateForPublish(publishable);
  const blockers = blockingFindings(moderation);

  // Record BEFORE the policy branch, so the blocked path cannot return without
  // its rows: a refused publish leaves no other trace anywhere: no published
  // files, no event, nothing on the project. These rows are the only evidence
  // it happened.
  //
  // Awaited, not fire-and-forget like track() above — the full argument is on
  // recordModerationFindings() in lib/moderation.ts. The short version: this is
  // a moderation record about one identifiable site, not an aggregate metric,
  // a floating promise is not guaranteed to complete once we return a Response,
  // and the call cannot throw or change the outcome either way. Whatever this
  // line does, the publish below behaves exactly as it did before it existed.
  await recordModerationFindings({ projectId: id, result: moderation, blocked: blockers });

  if (blockers.length > 0) {
    const worst = blockers[0];
    console.warn(
      `[kodely] publish blocked by moderation project=${id} user=${user.id} provider=${moderation.provider}`,
      blockers.map((f) => ({ rule: f.rule, path: f.path, evidence: f.evidence })),
    );
    return Response.json(
      {
        error: `Publishing blocked: ${worst.note} (${worst.path} — "${worst.evidence}"). If this is a mistake, edit the page or reply here and we'll take a look.`,
        moderation: { rule: worst.rule, path: worst.path },
      },
      { status: 400 },
    );
  }
  if (moderation.findings.length > 0) {
    // ModerationFinding is now the durable record; this stays as an operational
    // breadcrumb and is the one place that still shows EVERY occurrence. The
    // table records a non-blocking finding once per distinct (rule, file,
    // snippet) and skips exact repeats on republish — see the volume note in
    // lib/moderation.ts — so "fired again on an unchanged page" is a log
    // question, not a query.
    console.warn(
      `[kodely] publish moderation signals project=${id} user=${user.id} provider=${moderation.provider}`,
      moderation.findings.map((f) => ({ rule: f.rule, severity: f.severity, path: f.path })),
    );
  }

  await db.$transaction([
    db.projectFile.deleteMany({ where: { projectId: id, published: true, kind: "build" } }),
    db.projectFile.createMany({
      data: project.files.map((f) => ({
        projectId: id,
        path: f.path,
        content: f.content,
        published: true,
        kind: "build",
      })),
    }),
    db.project.update({ where: { id }, data: { publishedAt: new Date() } }),
  ]);

  // The North Star. `firstPublish` separates "reached the promise for the
  // first time" from a routine republish — the funnel counts the former.
  track(EVENTS.sitePublished, {
    userId: user.id,
    props: {
      projectId: id,
      slug: project.slug,
      firstPublish: !project.publishedAt,
      files: project.files.length,
    },
  });

  const host = req.headers.get("host") ?? "";
  const url = host.includes("staging")
    ? `https://${host}/api/site/${project.slug}`
    : `https://${project.slug}.${SITES_BASE}`;

  return Response.json({ url });
}

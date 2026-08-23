import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runAgent, normalizePath, type FileMap } from "@/lib/agent";
import { buildSite, BuildError } from "@/lib/build-site";
import {
  chargeForBuild,
  costMicros,
  getBalance,
  getSpendCapStatus,
  settleBuild,
  sumUsage,
  type Usage,
} from "@/lib/credits";
import { checkGenerateRateLimit } from "@/lib/rate-limit";
import { track, EVENTS } from "@/lib/events";
import { classifyFollowUp } from "@/lib/feedback-intent";
import { FLAGS, isEnabled } from "@/lib/flags";
import { brandPromptFragment, parseStoredBrandKit } from "@/lib/brand-kit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sse(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// A build that fails to compile even after one repair attempt gives up — this
// bounds the worst case to ~2x the cost of a normal generation, not unbounded.
const MAX_BUILD_ATTEMPTS = 2;

/** The four token columns on Build, from a Usage. */
function usageColumns(u: Usage) {
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheWriteTokens: u.cacheWriteTokens,
  };
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    projectId?: string;
    prompt?: string;
    image?: string;
    document?: string;
  } | null;
  const prompt = body?.prompt?.trim();
  if (!body?.projectId || !prompt) {
    return Response.json({ error: "Missing project or prompt." }, { status: 400 });
  }

  // Only a data: URL (what the client-side downscale in PromptHero, or the
  // composer's own image/video-frame path, produces) is accepted — anything
  // else is silently dropped rather than passed on.
  const imageMatch = body.image?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  const image = imageMatch ? { mediaType: imageMatch[1], data: imageMatch[2] } : undefined;

  // Same idea, for a directly-attached PDF (app/(portal)/dashboard/new's
  // Composer/attachment.ts). Real document input to the model — see
  // lib/agent.ts's message construction — not a file that ends up embedded
  // in the built site.
  const documentMatch = body.document?.match(/^data:application\/pdf;base64,(.+)$/);
  const document = documentMatch ? { data: documentMatch[1] } : undefined;

  const project = await db.project.findFirst({
    where: { id: body.projectId, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  // ── Kill switch ──────────────────────────────────────────────────────────
  // Placed after the project lookup (so an unknown project still 404s, and the
  // switch never leaks the existence of someone else's project) and before
  // EVERY spend path below it: the balance read, the spend cap, the Build row,
  // the user Message row and the model call in runAgent. Refusing here writes
  // nothing at all and charges nothing at all.
  //
  // Its own status and its own words, deliberately. The two checks immediately
  // below both answer 402 and both talk about credits; reusing either would
  // tell the user they are out of money during an incident that has nothing to
  // do with their balance, and they would go and top up. 503 is the honest
  // code: the capability is temporarily withdrawn by us.
  //
  // Bucketed on user.id — stable per user, so a partial rollout (if this were
  // ever operated as one) cannot flip the same person between requests.
  if (!(await isEnabled(FLAGS.generation, user.id))) {
    return Response.json(
      {
        error:
          "Building is paused right now while we sort out a problem on our side. Nothing has been charged and your project is untouched — please try again in a few minutes.",
      },
      { status: 503 },
    );
  }

  const balance = await getBalance(user.id);
  if (balance <= 0) {
    track(EVENTS.creditsExhausted, { userId: user.id, props: { projectId: project.id } });
    return Response.json(
      { error: "You're out of credits. Top up to keep building." },
      { status: 402 },
    );
  }

  // The user's own ceiling, checked before anything is spent. Distinct from
  // running out of credits: they still HAVE the balance, they asked us not to
  // burn past this without them saying so. The message says exactly that, so
  // it never reads as a surprise limit we imposed.
  const cap = await getSpendCapStatus(user.id);
  if (cap.reached) {
    track(EVENTS.spendCapReached, {
      userId: user.id,
      props: { cap: cap.cap, spent: cap.spent, projectId: project.id },
    });
    return Response.json(
      {
        error: `You've hit your own spending cap of ${cap.cap} credits per 30 days (${cap.spent} used). Raise or remove it in Settings to keep building.`,
        spendCapReached: true,
      },
      { status: 402 },
    );
  }

  const rateLimit = await checkGenerateRateLimit(user.id);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "You're generating too fast — take a short break and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  // The foundation means source files are never empty — "first build" is
  // instead "first real customization request" for this project.
  const kind = project.messages.length === 0 ? "create" : "edit";

  const build = await db.build.create({
    data: { projectId: project.id, status: "RUNNING", model: "", prompt },
  });

  track(EVENTS.buildStarted, {
    userId: user.id,
    props: {
      buildId: build.id,
      projectId: project.id,
      kind,
      hasImage: Boolean(image),
      hasDocument: Boolean(document),
      // Only meaningful on an edit — a first build has no prior output to be
      // reacting to. Left off `create` so followUpIntents() isn't diluted by
      // rows that were never follow-ups.
      ...(kind === "edit" ? { intent: classifyFollowUp(prompt) } : {}),
    },
  });

  await db.message.create({
    data: { projectId: project.id, role: "user", content: prompt },
  });

  // Aborted when the client disconnects (tab closed, network drop) — cancels
  // the in-flight Anthropic request instead of burning tokens for nobody.
  const abortController = new AbortController();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // A client disconnect races with our own sends: enqueue on a closed
      // controller throws "Controller is already closed", which used to be
      // caught as a generic failure and wrongly mark an otherwise-fine build
      // FAILED. There's nothing to do about a gone client — swallow it.
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {
          // client is gone
        }
      };

      let filesWritten = 0;
      let succeeded = false;
      // 0 means it compiled first try. This is the raw material for the
      // green-build-first-try metric (see greenBuildRate in lib/events.ts),
      // which the roadmap treats as a gate but nothing measured before.
      // Declared out here so the catch below can record it too.
      let repairAttempts = 0;
      // Usage kept PER ATTEMPT, not as one accumulator. A single running total
      // cannot tell the customer's request apart from the model repairing its
      // own broken output, and rule 4 of the anti-bill-shock contract charges
      // only the former (see settleBuild in lib/credits.ts). The run's true
      // total is still recorded — it is just sumUsage(attemptUsage) now.
      const attemptUsage: Usage[] = [];
      let model = "";
      let lastReply = "";
      let lastProgress = "";

      const readSourceFiles = async (): Promise<FileMap> => {
        const rows = await db.projectFile.findMany({
          where: { projectId: project.id, published: false, kind: "source" },
        });
        return Object.fromEntries(rows.map((f) => [f.path, f.content]));
      };

      try {
        // The project's brand kit, prepended to the FIRST request only.
        //
        // The repair loop below reassigns `request` on purpose: a repair pass
        // is about a compile error, not about the brand, and re-sending the
        // kit there would pay for it twice for no benefit.
        //
        // Without this the kit still reaches the generated site — the palette
        // is spliced into src/index.css as a Tailwind @theme block and the logo
        // is a real component — but the builder is never TOLD about it, so it
        // has no reason to use either.
        const brandRow = await db.projectFile.findFirst({
          where: { projectId: project.id, path: "brand.json", kind: "brand", published: false },
          select: { content: true },
        });
        const brand = brandRow ? parseStoredBrandKit(brandRow.content) : null;

        let request = brand ? `${brandPromptFragment(brand)}\n\n${prompt}` : prompt;
        let buildOutput: FileMap | null = null;
        let lastBuildError = "";

        // Resolved ONCE, outside the retry loop, so a repair pass can never run
        // on a different engine than the attempt it is repairing.
        //
        // Only ever an upgrade: runAgent treats KODELY_ENGINE=sdk as an
        // absolute pin and ignores this, so the flag cannot revoke an
        // operator's deliberate choice to stay off the metered key. Bucketed on
        // user.id, not per build — splitting one person's builds across both
        // engines would contaminate any comparison between them.
        const engine = (await isEnabled(FLAGS.sdkEngine, user.id)) ? "sdk" : "api";

        for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
          if (abortController.signal.aborted) break;

          const attemptTotals: Usage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          };
          attemptUsage.push(attemptTotals);

          const generator = runAgent({
            engine,
            history: project.messages.map((m) => ({
              role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: m.content,
            })),
            request,
            files: await readSourceFiles(),
            kind,
            // Only attached on the very first turn of a project — a repair
            // retry re-sends the same `request` text but should not attach
            // the image (or document) again mid-loop.
            image: attempt === 1 ? image : undefined,
            document: attempt === 1 ? document : undefined,
            signal: abortController.signal,
            onWrite: async (path, content) => {
              if (!normalizePath(path)) return false;
              await db.projectFile.upsert({
                where: {
                  projectId_path_published_kind: {
                    projectId: project.id,
                    path,
                    published: false,
                    kind: "source",
                  },
                },
                create: { projectId: project.id, path, content, published: false, kind: "source" },
                update: { content },
              });
              filesWritten++;
              return true;
            },
            onDelete: async (path) => {
              const { count } = await db.projectFile.deleteMany({
                where: { projectId: project.id, path, published: false, kind: "source" },
              });
              return count > 0;
            },
          });

          for await (const event of generator) {
            if (event.type === "text") {
              lastReply += event.text;
              send(event);
            } else if (event.type === "file") {
              send(event);
            } else if (event.type === "status") {
              send(event);
            } else if (event.type === "progress") {
              // Collapse consecutive identical lines. A run of twelve Reads
              // narrates as one "Looking through the project" rather than
              // twelve, which would read as a stutter rather than progress.
              if (event.text !== lastProgress) {
                lastProgress = event.text;
                send(event);
              }
            } else if (event.type === "usage") {
              model = event.model;
              attemptTotals.inputTokens += event.inputTokens;
              attemptTotals.outputTokens += event.outputTokens;
              attemptTotals.cacheReadTokens += event.cacheReadTokens;
              attemptTotals.cacheWriteTokens += event.cacheWriteTokens;
            }
          }

          if (abortController.signal.aborted) break;

          try {
            send({ type: "progress", text: "Compiling the site" });
            buildOutput = await buildSite(await readSourceFiles());
            break; // compiled cleanly — done
          } catch (err) {
            lastBuildError = err instanceof BuildError ? err.message : String(err);
            if (attempt >= MAX_BUILD_ATTEMPTS) throw new Error(lastBuildError);
            repairAttempts++;
            // Clear the dedupe key: the repair pass legitimately repeats the
            // same lines, and suppressing them would look like a stall.
            lastProgress = "";
            send({ type: "status", text: "Build didn't compile — fixing it…" });
            request = `The last change failed to build. Fix it and keep the rest of the change. Build error:\n${lastBuildError}`;
          }
        }

        if (abortController.signal.aborted || !buildOutput) {
          // Loop ended without a successful build and without throwing —
          // only reachable via the abort path (see the `break` above).
        } else {
          succeeded = true;

          // Replace the compiled tree with the new build output.
          await db.$transaction([
            db.projectFile.deleteMany({ where: { projectId: project.id, published: false, kind: "build" } }),
            ...(Object.keys(buildOutput).length > 0
              ? [
                  db.projectFile.createMany({
                    data: Object.entries(buildOutput).map(([path, content]) => ({
                      projectId: project.id,
                      path,
                      content,
                      published: false,
                      kind: "build",
                    })),
                  }),
                ]
              : []),
          ]);

          // costMicros is the WHOLE run — every attempt, recorded as spent.
          // credits is only the customer's own attempt; a repair pass is our
          // mistake and our cost. See settleBuild in lib/credits.ts.
          const totals = sumUsage(attemptUsage);
          const settlement = settleBuild(model, attemptUsage);
          const { costMicros: micros, credits } = settlement;
          // A zero charge writes no ledger row. The ledger is a financial
          // record; an entry that moves nothing is noise in a statement a
          // customer may one day be reading to understand their bill.
          const remaining =
            credits > 0
              ? await chargeForBuild(user.id, build.id, credits)
              : await getBalance(user.id);

          const sourceFiles = await readSourceFiles();
          const filesSnapshot = { source: sourceFiles, build: buildOutput };

          await db.build.update({
            where: { id: build.id },
            data: {
              status: "SUCCEEDED",
              model,
              endedAt: new Date(),
              ...usageColumns(totals),
              filesWritten,
              repairAttempts,
              costMicros: micros,
              creditsCharged: credits,
              filesSnapshot,
            },
          });

          track(EVENTS.buildSucceeded, {
            userId: user.id,
            props: {
              buildId: build.id,
              projectId: project.id,
              kind,
              model,
              repairAttempts,
              filesWritten,
              credits,
              remaining,
              // What rule 4 cost us on this build. Separate from `credits` so
              // the absorbed total is measurable without re-deriving it from
              // costMicros in every query.
              waivedCredits: settlement.waivedCredits,
              waivedMicros: settlement.waivedMicros,
            },
          });

          if (lastReply.trim()) {
            await db.message.create({
              data: { projectId: project.id, role: "assistant", content: lastReply.trim() },
            });
          }
          await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });

          // buildId travels to the client so it can attach a rating to this
          // specific build (see app/api/feedback/route.ts).
          //
          // repairWaived/waivedCredits make rule 4 visible instead of a silent
          // internal policy. The user watched "Build didn't compile — fixing
          // it…" go past; without this the next thing they see is a charge and
          // no statement that the fixing part was free. Editor.tsx ignores
          // fields it does not know, so it is safe to send today and to render
          // whenever that component is updated.
          send({
            type: "done",
            credits,
            remaining,
            filesWritten,
            buildId: build.id,
            repairAttempts,
            repairWaived: settlement.repairWaived,
            waivedCredits: settlement.waivedCredits,
          });
        }

        if (!succeeded) {
          const spent = sumUsage(attemptUsage);
          await db.build.update({
            where: { id: build.id },
            data: {
              status: "FAILED",
              endedAt: new Date(),
              error: abortController.signal.aborted ? "Client disconnected." : "Generation ended without producing output.",
              filesWritten,
              repairAttempts,
              creditsCharged: 0,
              // Charged zero, but the tokens were still spent. Rule 3 says a
              // failed build is "recorded with its true cost and charged
              // ZERO"; the recording half was missing, so every failure showed
              // $0.0000 in /admin and the give-away figure on
              // /admin/analytics was understated by exactly the cost of every
              // build that never worked. Under rule 4 that matters more, not
              // less: a run that burned two attempts and still failed is the
              // most expensive thing we absorb.
              ...usageColumns(spent),
              costMicros: costMicros(model, spent),
              // Record the model on failure too, when we got far enough to
              // learn it. It used to be written only on success, so every
              // failed build had a blank Model column — which made it
              // impossible to attribute a spike in failures to a model change,
              // exactly when you most need to.
              ...(model ? { model } : {}),
            },
          });

          track(EVENTS.buildFailed, {
            userId: user.id,
            props: {
              buildId: build.id,
              projectId: project.id,
              kind,
              repairAttempts,
              reason: abortController.signal.aborted ? "aborted" : "no_output",
            },
          });
        }
      } catch (error) {
        // A build that fails is never charged — that is the product promise,
        // so the ledger is deliberately untouched on this path.
        const message =
          error instanceof Error ? error.message : "The build failed unexpectedly.";
        console.error("[kodely] build failed", build.id, error);

        // Same as the other failure path: charged zero, recorded honestly.
        const spent = sumUsage(attemptUsage);

        await db.build.update({
          where: { id: build.id },
          data: {
            status: "FAILED",
            endedAt: new Date(),
            error: message.slice(0, 1000),
            filesWritten,
            repairAttempts,
            creditsCharged: 0,
            ...usageColumns(spent),
            costMicros: costMicros(model, spent),
            // See the note on the other failure path — a blank model makes a
            // failure impossible to attribute.
            ...(model ? { model } : {}),
          },
        });

        track(EVENTS.buildFailed, {
          userId: user.id,
          props: {
            buildId: build.id,
            projectId: project.id,
            kind,
            repairAttempts,
            reason: "error",
          },
        });

        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client disconnect path
        }
      }
    },
    cancel() {
      // The client disconnected — stop the in-flight Anthropic request
      // rather than let it run to completion for a response nobody reads.
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

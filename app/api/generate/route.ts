import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runAgent, normalizePath, type FileMap } from "@/lib/agent";
import { buildSite, BuildError } from "@/lib/build-site";
import { chargeForBuild, costMicros, creditsFor, getBalance } from "@/lib/credits";
import { checkGenerateRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sse(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// A build that fails to compile even after one repair attempt gives up — this
// bounds the worst case to ~2x the cost of a normal generation, not unbounded.
const MAX_BUILD_ATTEMPTS = 2;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    projectId?: string;
    prompt?: string;
    image?: string;
  } | null;
  const prompt = body?.prompt?.trim();
  if (!body?.projectId || !prompt) {
    return Response.json({ error: "Missing project or prompt." }, { status: 400 });
  }

  // Only a data: URL (what the client-side downscale in PromptHero produces)
  // is accepted — anything else is silently dropped rather than passed on.
  const imageMatch = body.image?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  const image = imageMatch ? { mediaType: imageMatch[1], data: imageMatch[2] } : undefined;

  const project = await db.project.findFirst({
    where: { id: body.projectId, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const balance = await getBalance(user.id);
  if (balance <= 0) {
    return Response.json(
      { error: "You're out of credits. Top up to keep building." },
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
      const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let model = "";
      let lastReply = "";

      const readSourceFiles = async (): Promise<FileMap> => {
        const rows = await db.projectFile.findMany({
          where: { projectId: project.id, published: false, kind: "source" },
        });
        return Object.fromEntries(rows.map((f) => [f.path, f.content]));
      };

      try {
        let request = prompt;
        let buildOutput: FileMap | null = null;
        let lastBuildError = "";

        for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
          if (abortController.signal.aborted) break;

          const generator = runAgent({
            history: project.messages.map((m) => ({
              role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: m.content,
            })),
            request,
            files: await readSourceFiles(),
            kind,
            // Only attached on the very first turn of a project — a repair
            // retry re-sends the same `request` text but should not attach
            // the image again mid-loop.
            image: attempt === 1 ? image : undefined,
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
            } else if (event.type === "usage") {
              model = event.model;
              totals.inputTokens += event.inputTokens;
              totals.outputTokens += event.outputTokens;
              totals.cacheReadTokens += event.cacheReadTokens;
              totals.cacheWriteTokens += event.cacheWriteTokens;
            }
          }

          if (abortController.signal.aborted) break;

          try {
            buildOutput = await buildSite(await readSourceFiles());
            break; // compiled cleanly — done
          } catch (err) {
            lastBuildError = err instanceof BuildError ? err.message : String(err);
            if (attempt >= MAX_BUILD_ATTEMPTS) throw new Error(lastBuildError);
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

          const micros = costMicros(model, totals);
          const credits = creditsFor(micros);
          const remaining = await chargeForBuild(user.id, build.id, credits);

          const sourceFiles = await readSourceFiles();
          const filesSnapshot = { source: sourceFiles, build: buildOutput };

          await db.build.update({
            where: { id: build.id },
            data: {
              status: "SUCCEEDED",
              model,
              endedAt: new Date(),
              inputTokens: totals.inputTokens,
              outputTokens: totals.outputTokens,
              cacheReadTokens: totals.cacheReadTokens,
              cacheWriteTokens: totals.cacheWriteTokens,
              filesWritten,
              costMicros: micros,
              creditsCharged: credits,
              filesSnapshot,
            },
          });

          if (lastReply.trim()) {
            await db.message.create({
              data: { projectId: project.id, role: "assistant", content: lastReply.trim() },
            });
          }
          await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });

          send({ type: "done", credits, remaining, filesWritten });
        }

        if (!succeeded) {
          await db.build.update({
            where: { id: build.id },
            data: {
              status: "FAILED",
              endedAt: new Date(),
              error: abortController.signal.aborted ? "Client disconnected." : "Generation ended without producing output.",
              filesWritten,
              creditsCharged: 0,
            },
          });
        }
      } catch (error) {
        // A build that fails is never charged — that is the product promise,
        // so the ledger is deliberately untouched on this path.
        const message =
          error instanceof Error ? error.message : "The build failed unexpectedly.";
        console.error("[kodely] build failed", build.id, error);

        await db.build.update({
          where: { id: build.id },
          data: {
            status: "FAILED",
            endedAt: new Date(),
            error: message.slice(0, 1000),
            filesWritten,
            creditsCharged: 0,
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

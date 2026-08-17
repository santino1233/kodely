import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runAgent, normalizePath, type FileMap } from "@/lib/agent";
import { chargeForBuild, costMicros, creditsFor, getBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sse(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    projectId?: string;
    prompt?: string;
  } | null;
  const prompt = body?.prompt?.trim();
  if (!body?.projectId || !prompt) {
    return Response.json({ error: "Missing project or prompt." }, { status: 400 });
  }

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

  const draft = await db.projectFile.findMany({
    where: { projectId: project.id, published: false },
  });
  const files: FileMap = Object.fromEntries(draft.map((f) => [f.path, f.content]));
  const kind = draft.length === 0 ? "create" : "edit";

  const build = await db.build.create({
    data: {
      projectId: project.id,
      status: "RUNNING",
      model: "",
      prompt,
    },
  });

  await db.message.create({
    data: { projectId: project.id, role: "user", content: prompt },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(sse(event)));
      let reply = "";
      let filesWritten = 0;

      try {
        const generator = runAgent({
          history: project.messages.map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
          request: prompt,
          files,
          kind,
          onWrite: async (path, content) => {
            if (!normalizePath(path)) return false;
            await db.projectFile.upsert({
              where: {
                projectId_path_published: { projectId: project.id, path, published: false },
              },
              create: { projectId: project.id, path, content, published: false },
              update: { content },
            });
            filesWritten++;
            return true;
          },
          onDelete: async (path) => {
            const { count } = await db.projectFile.deleteMany({
              where: { projectId: project.id, path, published: false },
            });
            return count > 0;
          },
        });

        for await (const event of generator) {
          if (event.type === "text") {
            reply += event.text;
            send(event);
          } else if (event.type === "file") {
            send(event);
          } else if (event.type === "usage") {
            // The build succeeded. Meter the real spend, then charge.
            const micros = costMicros(event.model, event);
            const credits = creditsFor(micros);
            const remaining = await chargeForBuild(user.id, build.id, credits);

            await db.build.update({
              where: { id: build.id },
              data: {
                status: "SUCCEEDED",
                model: event.model,
                endedAt: new Date(),
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cacheReadTokens: event.cacheReadTokens,
                cacheWriteTokens: event.cacheWriteTokens,
                filesWritten,
                costMicros: micros,
                creditsCharged: credits,
              },
            });

            if (reply.trim()) {
              await db.message.create({
                data: { projectId: project.id, role: "assistant", content: reply.trim() },
              });
            }
            await db.project.update({
              where: { id: project.id },
              data: { updatedAt: new Date() },
            });

            send({ type: "done", credits, remaining, filesWritten });
          }
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
        controller.close();
      }
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

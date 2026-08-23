"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Composer,
  type AssistResult,
  type AttachedDocument,
  type AttachedLogo,
  type CreditContext,
} from "./Composer";
import { BuildLaunch } from "./BuildLaunch";
import {
  INITIAL_BUILD,
  parseStreamEvent,
  reduceBuild,
  type BuildProgress,
  type BuildSignal,
} from "./build-steps";

type Phase = "compose" | "building";

/**
 * WHAT HAPPENS TO A LOGO AND A PALETTE HANDED OVER BY A HELPER FLOW
 *
 * Both TemplatePickerModal and InlineWizard can return `logoDataUrl` and
 * `palette`. Neither may be accepted from the customer and then dropped, so:
 *
 * PALETTE reaches the build as TEXT. Both flows already write their chosen
 * hexes into the prompt they assemble (see the `- Palette: <id> (#a to #b)`
 * line in lib/wizard.ts and components/templates/intake.ts), and Composer's
 * withPalette() appends them to the composer's own text in the case where they
 * are somehow absent. So the colours are in the box, where the customer can
 * read and change them, and they travel in the request like any other words.
 *
 * LOGO reaches the build as the `image` field on POST /api/generate — the
 * same field the reference-image control used to fill, and the reason the
 * plumbing for it survives that control's removal. components/templates/logo.ts
 * and components/wizard/inline-logo.ts both emit `data:image/png;base64,…`
 * precisely because that is the one thing the route's regex accepts, and the
 * route hands it to the model on ATTEMPT 1 only. The composer says exactly that
 * beside the thumbnail rather than implying it is uploaded and stored.
 *
 * A directly-attached PDF takes a THIRD, newer path: the `document` field,
 * gated to attempt 1 the same way, carrying real document input to the model
 * (see lib/agent.ts). Neither helper flow here produces one — only the
 * composer's own "+"/paste/drop can — so `referenceDocument` state exists
 * only in this file and Composer.tsx, not in AssistResult.
 *
 * NOT the brand-kit route (PUT /api/projects/[id]/brand), which would compile
 * the logo into src/components/brand/BrandLogo.tsx and seed the palette as a
 * Tailwind @theme block — a stronger path. buildBrandKit() in lib/brand-kit.ts
 * REQUIRES a business name and refuses without one, and neither pinned result
 * type carries one; deriving a business name from the first 60 characters of a
 * brief would put "A one-page site for my barbershop with services" into the
 * customer's header, footer and <title> verbatim, which is the exact sentence
 * brandPromptFragment() promises to use unaltered. A brand kit is the right
 * home for these once there is a name to give it, and the prompts both flows
 * write already tell the model honestly that the logo is guidance rather than
 * an asset it can embed.
 */
export function CreateFlow({
  initialPrompt,
  templateName,
  credits,
  canTopUp,
}: {
  initialPrompt: string;
  templateName: string | null;
  credits: CreditContext;
  canTopUp: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("compose");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [startedFrom, setStartedFrom] = useState<string | null>(templateName);
  const [logo, setLogo] = useState<AttachedLogo | null>(null);
  /** The other half of the same one-slot reference attachment — see the note
      on AttachedDocument in Composer.tsx. Mutually exclusive with `logo`;
      Composer's attachFile() keeps that true by always clearing the one it
      isn't setting. */
  const [referenceDocument, setReferenceDocument] = useState<AttachedDocument | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [progress, setProgress] = useState<BuildProgress>(INITIAL_BUILD);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  /** True only when the server REFUSED the request with a non-2xx response.
      Those paths (kill switch, no credits, spend cap, rate limit) all return
      before app/api/generate/route.ts writes a Build row or a user Message, so
      the project is still pristine and a retry is genuinely a first build. */
  const [retrySafe, setRetrySafe] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  /** Mirrors `progress` for the async loop, which cannot read state. */
  const stateRef = useRef<BuildProgress>(INITIAL_BUILD);

  const running = phase === "building" && progress.outcome === "running";

  // Closing or reloading the tab drops the response body, which aborts the
  // model request server-side. Warning about it is the honest thing to do —
  // the alternative is someone losing a build they were watching.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // Navigating away inside the app (a sidebar link, the back button) unmounts
  // this component but does NOT cancel an in-flight fetch — the build would
  // keep running for a screen nobody is looking at and then yank the customer
  // into the builder from wherever they had gone. Aborting on unmount is what
  // makes "leaving stops the build" a true statement rather than a hope, and
  // an aborted build is written FAILED with creditsCharged: 0.
  //
  // Safe on the success path: `run` clears abortRef in its finally block
  // before React processes the navigation router.push() schedules.
  useEffect(() => () => abortRef.current?.abort(), []);

  const signal = useCallback((s: BuildSignal) => {
    const next = reduceBuild(stateRef.current, s);
    stateRef.current = next;
    setProgress(next);
    return next;
  }, []);

  const run = useCallback(
    async (
      text: string,
      imageDataUrl: string | null,
      documentDataUrl: string | null,
      existingProjectId: string | null,
    ) => {
      stateRef.current = INITIAL_BUILD;
      setProgress(INITIAL_BUILD);
      setStopping(false);
      setRetrySafe(false);
      stoppedRef.current = false;
      setSubmitted(text);
      setPhase("building");

      let id = existingProjectId;

      // ── 1. The project ───────────────────────────────────────────────────
      if (id === null) {
        try {
          const res = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The server derives a real summarized title from the prompt
            // itself (lib/title.ts) — see app/api/projects/route.ts.
            body: JSON.stringify({ prompt: text }),
          });
          const body: unknown = await res.json().catch(() => null);
          const created =
            typeof body === "object" && body !== null
              ? (body as { project?: { id?: unknown } }).project
              : undefined;
          if (!res.ok || typeof created?.id !== "string") {
            const message =
              typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
                ? (body as { error: string }).error
                : "Your project couldn't be created. Nothing was charged — try again.";
            signal({ kind: "failed", message });
            setRetrySafe(true);
            return;
          }
          id = created.id;
        } catch {
          signal({
            kind: "failed",
            message:
              "Your project couldn't be created — the request didn't reach Kodely. Nothing was charged.",
          });
          setRetrySafe(true);
          return;
        }
        setProjectId(id);
      }
      signal({ kind: "project-created" });

      // ── 2. The build ─────────────────────────────────────────────────────
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            prompt: text,
            image: imageDataUrl,
            document: documentDataUrl,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body: unknown = await res.json().catch(() => null);
          const message =
            typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : "The build couldn't be started.";
          // A refusal happens before anything is written or charged, so this
          // project is still a clean slate.
          setRetrySafe(true);
          signal({ kind: "failed", message });
          return;
        }

        signal({ kind: "accepted" });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawTerminal = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!frame.startsWith("data: ")) continue;
            let raw: unknown;
            try {
              raw = JSON.parse(frame.slice(6));
            } catch {
              continue;
            }
            const event = parseStreamEvent(raw);
            if (event === null) continue;
            if (event.type === "done" || event.type === "error") sawTerminal = true;
            signal({ kind: "sse", event });
          }
        }

        // The route always sends `done` or `error` unless the client went
        // away. A stream that ends without either IS a dropped connection —
        // saying "finished" here would be the exact lie this screen exists to
        // avoid.
        if (!sawTerminal) signal({ kind: "lost" });

        if (stateRef.current.outcome === "succeeded" && id !== null) {
          router.push(`/projects/${id}`);
        }
      } catch {
        if (stoppedRef.current) signal({ kind: "stopped" });
        else
          signal({
            kind: "failed",
            message:
              "The connection to the build dropped. Nothing was charged — open the project to see what was written.",
          });
      } finally {
        abortRef.current = null;
        setStopping(false);
      }
    },
    [router, signal],
  );

  function stop() {
    if (!running || stopping || abortRef.current === null) return;
    stoppedRef.current = true;
    setStopping(true);
    // A real cancel: aborting the fetch closes the response body, which fires
    // cancel() on the route's stream and aborts the model request. The Build
    // row is written FAILED with creditsCharged: 0.
    abortRef.current.abort();
  }

  if (phase === "building") {
    return (
      <BuildLaunch
        progress={progress}
        prompt={submitted}
        projectId={projectId}
        stopping={stopping}
        onStop={stop}
        onRetry={
          retrySafe && progress.outcome === "failed"
            ? () => void run(submitted, logo?.dataUrl ?? null, referenceDocument?.dataUrl ?? null, projectId)
            : null
        }
        onEdit={() => {
          setPhase("compose");
          setProgress(INITIAL_BUILD);
          stateRef.current = INITIAL_BUILD;
        }}
      />
    );
  }

  return (
    // Centered in the visible content area, not just at the top of a tall
    // scroll container — the min-height subtracts the shell's own topbar and
    // padding so "centered" means centered in what's actually on screen,
    // approximately, across the range of real viewport heights rather than
    // exactly on any one of them.
    <div className="flex min-h-[calc(100dvh-var(--topbar-h)-7rem)] items-center justify-center lg:min-h-[calc(100dvh-var(--topbar-h)-9rem)]">
    <Composer
      value={prompt}
      onChange={setPrompt}
      logo={logo}
      onLogoChange={setLogo}
      referenceDocument={referenceDocument}
      onReferenceDocumentChange={setReferenceDocument}
      // A helper flow replaces the box's contents wholesale rather than
      // appending: the customer picked a template or answered the wizard
      // specifically to REPLACE whatever placeholder text was there, and
      // appending would leave both texts arguing with each other in the
      // request. The prompt still lands in the editable box, not the request,
      // so nothing is submitted without the customer having seen it.
      //
      // Both flows only ever hand back an image (`result.logo`), never a
      // PDF — so accepting one also clears any PDF the customer had
      // separately attached, keeping the one-slot rule true.
      onAssist={(result: AssistResult) => {
        setPrompt(result.prompt);
        setLogo(result.logo);
        setReferenceDocument(null);
        setStartedFrom(result.templateName);
      }}
      onSubmit={() =>
        void run(prompt.trim(), logo?.dataUrl ?? null, referenceDocument?.dataUrl ?? null, projectId)
      }
      fromTemplate={startedFrom}
      credits={credits}
      canTopUp={canTopUp}
    />
    </div>
  );
}

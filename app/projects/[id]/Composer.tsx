"use client";

import { useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import CostEstimate, { type CreditRange } from "./CostEstimate";

// The prompt box and everything that belongs to the act of asking for a change.
//
// EVERY CONTROL HERE IS REAL. What was considered and left out, and why:
//
//  * Attaching a non-image file. There is no multipart handler, no object
//    store and no path by which a .pdf or a .zip could reach the model —
//    app/api/generate/route.ts reads a JSON body and accepts exactly one
//    optional field, `image`, matched against
//    /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/ and silently dropped
//    otherwise. So the picker accepts images only and says so.
//  * A voice button. Nothing transcribes.
//  * "Save as draft" / "queue this change". The route runs one build per
//    request, synchronously, over an open stream. There is no queue.
//
// Stop IS real and is not a UI trick: aborting the fetch closes the response
// body, which fires cancel() on the route's ReadableStream, which aborts the
// in-flight model request server-side. The build row is then written FAILED
// with creditsCharged: 0. See the comment block in BuildInterrupted.tsx.

// Downscale + re-encode client-side, the same treatment the homepage prompt
// gives a reference image: a phone photo is several megabytes of JSON body and
// a large number of vision tokens, and a reference only needs to be legible.
// toDataURL("image/jpeg") produces exactly the `data:image/jpeg;base64,` shape
// the route's regex accepts.
async function downscaleImage(file: File, maxDim = 1400, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t resize the image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function Composer({
  value,
  onChange,
  promptRef,
  onSubmit,
  onStop,
  busy,
  stopping,
  isFirstBuild,
  balance,
  estimate,
  avgBuildCredits,
  measuredBuilds,
  image,
  onImageChange,
  enhancing,
  onEnhance,
  enhancedFrom,
  onRevertEnhance,
  before,
}: {
  value: string;
  onChange: (v: string) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  stopping: boolean;
  isFirstBuild: boolean;
  balance: number;
  estimate: CreditRange;
  avgBuildCredits: number;
  measuredBuilds: number;
  /** A data: URL, already downscaled. Null when nothing is attached. */
  image: string | null;
  onImageChange: (image: string | null) => void;
  enhancing: boolean;
  onEnhance: () => void;
  /** The prompt as typed, held while an expanded spec sits in the box. */
  enhancedFrom: string | null;
  onRevertEnhance: () => void;
  /** Undo/redo and the selection panel — rendered above the box because both
      describe the change that is about to be typed. */
  before?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const specMode = enhancedFrom !== null;

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately: picking the same file twice in a row fires no change
    // event otherwise, which reads as the button being broken.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Kodely can only look at images — PNG, JPEG or WebP.");
      return;
    }
    setImageError(null);
    try {
      onImageChange(await downscaleImage(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Couldn’t read that image.");
    }
  }

  return (
    <div className="shrink-0 border-t border-hair bg-surface px-3 pt-2.5 pb-3">
      {before}

      {specMode && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-brand-tint px-2.5 py-1.5 text-[0.75rem] text-brand-ink dark:text-brand">
          <span>Expanded spec — edit it before building</span>
          <button
            type="button"
            onClick={onRevertEnhance}
            className="k-focus shrink-0 rounded-sm font-medium underline underline-offset-2"
          >
            Revert
          </button>
        </div>
      )}

      {image && (
        <div className="mb-2 flex items-center gap-2.5 rounded-md border border-hair bg-surface-2 p-2">
          {/* A local data: URL of the user's own file. next/image adds nothing
              here — there is no remote host, no layout shift to prevent and no
              format to negotiate. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Attached reference"
            className="size-10 shrink-0 rounded-sm object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-medium text-ink">Reference image attached</p>
            <p className="text-[0.6875rem] text-ink-3">
              Sent with this build as visual guidance.
            </p>
          </div>
          <IconButton
            label="Remove the attached image"
            size="xs"
            onClick={() => onImageChange(null)}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </IconButton>
        </div>
      )}

      {imageError && <p className="mb-2 text-[0.6875rem] text-danger">{imageError}</p>}

      <Textarea
        id="kodely-prompt"
        ref={promptRef}
        aria-label={isFirstBuild ? "Describe the site you want" : "Describe a change"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl-Enter always builds — including while a spec is on screen,
          // where plain Enter has been handed to the editor.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
            return;
          }
          // Enter sends a one-liner, but while a spec is on screen this box is
          // a multi-line editor — there, Enter has to make a newline or the
          // first paragraph break the user types starts a build of a
          // half-edited spec.
          if (e.key === "Enter" && !e.shiftKey && !specMode) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={
          isFirstBuild
            ? "Describe the site you want — who it’s for, what it’s selling, how it should feel"
            : "Ask Kodely to change anything…"
        }
        // A ~200-word spec in a three-row box is unreviewable, and an
        // unreviewed spec defeats the point of showing one.
        rows={specMode ? 12 : 3}
        className="resize-none"
      />

      {/* Plan before spend. Hidden while a build runs: the copy describes the
          NEXT build, and leaving it up would relabel the running build's cost
          mid-flight. */}
      {!busy && (
        <div className="mt-2">
          <CostEstimate
            id="kodely-cost-estimate"
            kind={isFirstBuild ? "create" : "edit"}
            range={estimate}
            balance={balance}
            avgBuildCredits={avgBuildCredits}
            measuredBuilds={measuredBuilds}
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={pickImage}
        />
        <IconButton
          label="Attach a reference image"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="border border-hair"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m4 17 5-5 4.5 4.5L16 14l4 4" />
          </svg>
        </IconButton>

        <Button
          size="sm"
          variant="ghost"
          onClick={onEnhance}
          loading={enhancing}
          disabled={busy || !value.trim()}
          title="Expand this into a fuller spec you can read and edit before spending anything"
          className="border border-hair"
        >
          Enhance
        </Button>

        {busy ? (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={onStop}
            disabled={stopping}
            title="Cancel this build — you won’t be charged for it"
          >
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <Button
            // The one gradient fill in the builder. The customer's repeated
            // action here is asking for a change, not publishing — Publish in
            // the header is deliberately secondary so this stays the only
            // primary in the view.
            size="sm"
            variant="primary"
            className="flex-1"
            onClick={onSubmit}
            disabled={!value.trim()}
            // Reads the estimate out when the button takes focus, which is how
            // the warning reaches a screen reader without a second aria-live
            // region competing with the progress list.
            aria-describedby="kodely-cost-estimate"
          >
            {isFirstBuild ? "Build site" : "Apply change"}
          </Button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { buildPreviewDocument } from "../preview-agent";

// The full-tab draft preview. Same assembly as the editor's pane and the same
// sandbox — `allow-scripts allow-forms`, never `allow-same-origin`, because
// this document is generated customer code and this page is on our origin.
//
// A thin bar rather than none: without it there is nothing on screen saying
// this is an unpublished draft, and a full-bleed page that looks exactly like
// a live site is the sort of thing people screenshot and send to a client.

export default function StandalonePreview({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [nonce, setNonce] = useState(0);
  // One state object carrying WHICH request produced it, rather than separate
  // doc / error / loading flags. `loading` used to be a stored boolean that had
  // to be reset synchronously at the top of the effect on every Reload — the
  // cascading-render pattern React lints against, and it also meant three
  // setState calls could disagree for a render.
  //
  // Comparing the nonce the effect last ANSWERED against the nonce it was last
  // ASKED gives the same answer with no reset and no extra render pass. Loading
  // deliberately keeps the previous document on screen: a Reload that blanks
  // the page and then repaints it reads as the site having broken.
  const [result, setResult] = useState<{ nonce: number; doc: string | null; error: string | null }>(
    { nonce: -1, doc: null, error: null },
  );
  const loading = result.nonce !== nonce;
  const doc = result.doc;
  // A stale error from the previous attempt must not sit on screen while the
  // next one is still in flight.
  const error = loading ? null : result.error;

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/preview/${projectId}`;

    (async () => {
      try {
        const res = await fetch(`${base}/index.html`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("The preview could not be loaded.");
        // `missing` is dropped here on purpose. The editor reports it because
        // it is where you would act on it; this tab is for looking at the
        // page, and a warning strip over someone's site is not what they
        // opened a clean tab for.
        const built = await buildPreviewDocument(await res.text(), async (path) => {
          const asset = await fetch(`${base}/${path}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          return asset.ok ? await asset.text() : null;
        });
        if (controller.signal.aborted) return;
        setResult({ nonce, doc: built.doc, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setResult({
          nonce,
          doc: null,
          error: err instanceof Error ? err.message : "The preview could not be loaded.",
        });
      }
      // No `finally`: an aborted request must NOT record an answer for this
      // nonce, or a superseded fetch would mark the newer request as finished.
    })();

    return () => controller.abort();
  }, [projectId, nonce]);

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hair bg-surface px-3 py-2">
        <Badge tone="neutral" dot>
          Draft preview
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-2">{projectName}</span>
        <Button size="xs" variant="ghost" className="border border-hair" onClick={() => setNonce((n) => n + 1)}>
          Reload
        </Button>
        <ButtonLink size="xs" href={`/projects/${projectId}`}>
          Back to the editor
        </ButtonLink>
      </div>

      <div className="min-h-0 flex-1 bg-inset">
        {error ? (
          <div className="grid h-full place-items-center p-6">
            <EmptyState
              kind="unavailable"
              title="Nothing to preview"
              body={error}
              action={
                <ButtonLink size="sm" href={`/projects/${projectId}`}>
                  Back to the editor
                </ButtonLink>
              }
            />
          </div>
        ) : doc === null ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-3">
            {loading && <Spinner size={16} />}
            {loading ? "Assembling the preview…" : "Nothing built yet."}
          </div>
        ) : (
          <iframe
            key={nonce}
            srcDoc={doc}
            sandbox="allow-scripts allow-forms"
            title={`Draft preview of ${projectName}`}
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}

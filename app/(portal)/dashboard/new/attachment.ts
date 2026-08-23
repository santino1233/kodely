/**
 * Reference-file handling for the portal composer.
 *
 * Formerly image.ts, image-only. Now handles the three kinds of reference
 * file the composer actually accepts:
 *
 *   - an IMAGE, downscaled and re-encoded client-side, same as always.
 *   - a PDF, read as bytes and shipped as base64 — no client-side processing
 *     is possible or needed, the model reads the real document.
 *   - a VIDEO, which the model cannot see at all. What this module extracts
 *     is a single still frame (the first one), re-encoded through the exact
 *     same path as a direct image attachment (`prepareReferenceImage`) — a
 *     video is never sent anywhere; the model only ever sees one PNG.
 *
 * Deliberately a COPY of the downscale in components/marketing/PromptHero.tsx
 * (lines 44-57) rather than an import for the image path: that file belongs
 * to the marketing system and to another owner. The two must agree on one
 * thing only — the image output has to be a
 * `data:image/(png|jpeg|webp);base64,…` URL, because that regex in
 * app/api/generate/route.ts is the gate for the `image` field. The PDF output
 * has to be `data:application/pdf;base64,…`, the gate for the separate
 * `document` field in that same route. Anything that doesn't match either
 * shape is silently dropped server-side and the customer would never learn
 * their file was ignored, so this module refuses up front instead.
 */

/** Exactly what app/api/generate/route.ts will accept as an `image`. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Exactly what app/api/generate/route.ts will accept as a `document`. */
export const PDF_TYPE = "application/pdf";

/**
 * First-frame extraction only needs to decode the container well enough to
 * paint one frame to a `<video>` element — these three cover what a browser
 * can actually play back, which is the only thing that matters here (nothing
 * downstream ever receives the video file itself).
 */
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** What the file picker offers. Narrower than `image/*` or `video/*` on
    purpose — e.g. a HEIC from a phone would be offered by `image/*` and then
    fail to decode. */
export const ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp," +
  ".pdf,application/pdf," +
  ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

/** A PDF this large is refused before it is even read into memory — Claude's
    document input has its own ceiling, and reading a much larger file into a
    string first just freezes the tab for a refusal we already know is coming. */
const MAX_PDF_BYTES = 32 * 1024 * 1024;

export type ImageResult =
  | { ok: true; dataUrl: string; name: string; bytes: number }
  | { ok: false; error: string };

export type DocumentResult =
  | { ok: true; dataUrl: string; name: string; bytes: number }
  | { ok: false; error: string };

/**
 * Downscale and re-encode to JPEG. Re-encoding is what makes the result
 * predictable: whatever came in, what goes out is `data:image/jpeg;base64,…`,
 * which the generate route accepts. It also keeps a 12MP phone photo from
 * costing a fortune in image tokens for detail the model cannot use.
 *
 * This is also the path a video's extracted first frame goes through — see
 * extractVideoFirstFrame below — so there is exactly one place that decides
 * what an "image" reaching the model looks like.
 */
export async function prepareReferenceImage(
  file: File,
  maxDim = 1400,
  quality = 0.82,
): Promise<ImageResult> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error:
        "That file type can't be used as a reference. Kodely can read a PNG, JPEG or WebP image, a PDF document, or an MP4/WebM/MOV video (as its first frame).",
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "This browser couldn't read that image." };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
      return { ok: false, error: "This browser couldn't re-encode that image." };
    }
    // Base64 of the payload, minus the `data:image/jpeg;base64,` prefix.
    const bytes = Math.round((dataUrl.length - 23) * 0.75);
    return { ok: true, dataUrl, name: file.name, bytes };
  } catch {
    return { ok: false, error: "That image couldn't be read. Try a different one." };
  }
}

/**
 * Read a PDF's raw bytes into a base64 data URL. No downscaling is possible
 * or meaningful here — unlike an image, the whole point is that Claude reads
 * the actual document (its text and layout), not a rendering of it, so
 * nothing about the file is transformed on the way in.
 */
export async function prepareReferenceDocument(file: File): Promise<DocumentResult> {
  if (file.type !== PDF_TYPE) {
    return { ok: false, error: "That file type can't be used as a reference PDF." };
  }
  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `That PDF is ${Math.round(file.size / (1024 * 1024))} MB — Kodely can read PDFs up to ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB.`,
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const base64 = base64FromArrayBuffer(buffer);
    return {
      ok: true,
      dataUrl: `data:${PDF_TYPE};base64,${base64}`,
      name: file.name,
      bytes: file.size,
    };
  } catch {
    return { ok: false, error: "That PDF couldn't be read. Try a different file." };
  }
}

/**
 * Extract the FIRST FRAME of a video, client-side, as a still PNG — then run
 * it through the exact same prepareReferenceImage() path a directly-attached
 * image takes. This is the one honest way to give the model anything from a
 * video: there is no video input on the Anthropic API, so what the model ends
 * up seeing is genuinely one real frame, nothing more. It never sees motion,
 * never hears audio, and the video file itself is never sent anywhere — only
 * this one derived PNG is.
 */
export async function extractVideoFirstFrame(file: File): Promise<ImageResult> {
  if (!(ACCEPTED_VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "That video format can't be read. Use MP4, WebM or MOV.",
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("That video couldn't be decoded."));
    });

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return { ok: false, error: "That video couldn't be read." };

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "This browser couldn't read that video." };
    ctx.drawImage(video, 0, 0, w, h);

    const frameDataUrl = canvas.toDataURL("image/png");
    const blob = await (await fetch(frameDataUrl)).blob();
    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "video";
    const frameFile = new File([blob], `${baseName}-frame.png`, { type: "image/png" });
    return prepareReferenceImage(frameFile);
  } catch {
    return { ok: false, error: "That video's first frame couldn't be captured. Try a different file." };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Chunked so a large PDF doesn't blow `String.fromCharCode`'s argument-count
    limit — spreading tens of megabytes of bytes as individual arguments is
    exactly the kind of call that limit exists to catch. */
function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

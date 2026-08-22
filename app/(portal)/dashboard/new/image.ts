/**
 * Reference-image handling for the portal composer.
 *
 * Deliberately a COPY of the downscale in components/marketing/PromptHero.tsx
 * (lines 44-57) rather than an import: that file belongs to the marketing
 * system and to another owner. The two must agree on one thing only — the
 * output has to be a `data:image/(png|jpeg|webp);base64,…` URL, because that
 * regex in app/api/generate/route.ts (line 57) is the sole gate. Anything else
 * is silently dropped server-side and the customer never learns their image
 * was ignored, so this module refuses it up front instead.
 */

/** Exactly what app/api/generate/route.ts will accept. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** What the file picker offers. Narrower than `image/*` on purpose — a HEIC
    from a phone would be offered by `image/*` and then fail to decode. */
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

export type ImageResult =
  | { ok: true; dataUrl: string; name: string; bytes: number }
  | { ok: false; error: string };

/**
 * Downscale and re-encode to JPEG. Re-encoding is what makes the result
 * predictable: whatever came in, what goes out is `data:image/jpeg;base64,…`,
 * which the generate route accepts. It also keeps a 12MP phone photo from
 * costing a fortune in image tokens for detail the model cannot use.
 */
export async function prepareReferenceImage(
  file: File,
  maxDim = 1400,
  quality = 0.82,
): Promise<ImageResult> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "That file type can't be used as a reference. Pick a PNG, JPEG or WebP image.",
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

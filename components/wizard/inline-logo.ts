/**
 * Logo handling for the inline wizard.
 *
 * Deliberately a SIBLING of app/(portal)/dashboard/new/attachment.ts rather than an
 * import of it, for the same reason that file is a copy of the downscale in
 * components/marketing/PromptHero.tsx: it belongs to another owner, and the two
 * only have to agree about one thing —
 *
 *     the output must match /^data:image\/(png|jpeg|webp);base64,/
 *
 * which is the sole gate in app/api/generate/route.ts (line 57). Anything else
 * is dropped server-side without a word to the customer, so this module refuses
 * it up front instead.
 *
 * ## Two differences from the reference-image path, both deliberate
 *
 *  1. PNG out, not JPEG. A logo is the one image that is usually transparent,
 *     and JPEG has no alpha — re-encoding one silently paints the transparent
 *     area black. PNG keeps it, and `image/png` is on the generate route's
 *     accept list, so nothing downstream cares.
 *
 *  2. A much smaller long edge. This is a brand cue for the model to read, not
 *     artwork to reproduce, and every extra kilobyte is base64 in the request.
 *     LOGO_MAX_EDGE mirrors the reasoning in lib/brand-kit.ts's LOGO_LIMITS:
 *     a flat-colour mark is legible to a vision model far below the size it
 *     would need to be printed at.
 *
 * ## What we do NOT accept
 *
 * SVG. It has to go through `sanitizeSvg` in lib/brand-kit.ts before it is safe
 * to inline anywhere, that function is server-side (it uses node Buffer for the
 * raster path and is not built to run here), and the generate route would
 * refuse `image/svg+xml` regardless. Offering an SVG picker that silently
 * failed later would be exactly the kind of half-working control this product
 * is trying to stop shipping.
 */

/** Exactly what app/api/generate/route.ts will accept as an image. */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Narrower than `image/*` on purpose — a HEIC from a phone would be offered by
 *  `image/*` and then fail to decode. */
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

/** Longest edge after downscaling. See the note above. */
export const LOGO_MAX_EDGE = 320;

/** Refuse a file this large before decoding it: a 40 MB PNG would be scaled
 *  down to the same 320px either way, and decoding it first just freezes the
 *  tab on a phone. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export type LogoResult =
  | { ok: true; dataUrl: string; name: string; bytes: number }
  | { ok: false; error: string };

/**
 * Downscale and re-encode a picked file to a PNG data URL.
 *
 * Re-encoding is what makes the result predictable: whatever came in, what goes
 * out is `data:image/png;base64,…`. The prefix is checked rather than assumed,
 * because a browser that cannot honour the requested type falls back to PNG
 * silently in some engines and to nothing at all in others.
 */
export async function prepareLogo(file: File): Promise<LogoResult> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "That file type can't be used. Pick a PNG, JPEG or WebP — SVG isn't supported here.",
    };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: `That file is ${Math.round(file.size / (1024 * 1024))} MB. Export it smaller — a logo never needs more than a megabyte.`,
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { ok: false, error: "This browser couldn't read that image." };
    }
    // No fill first: the canvas starts fully transparent, which is what keeps a
    // transparent logo transparent all the way into the PNG.
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/png");
    const PREFIX = "data:image/png;base64,";
    if (!dataUrl.startsWith(PREFIX)) {
      return { ok: false, error: "This browser couldn't re-encode that image." };
    }
    return {
      ok: true,
      dataUrl,
      name: file.name,
      bytes: Math.round((dataUrl.length - PREFIX.length) * 0.75),
    };
  } catch {
    return { ok: false, error: "That image couldn't be read. Try a different file." };
  }
}

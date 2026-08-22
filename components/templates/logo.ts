import { LOGO_LIMITS } from "@/lib/brand-kit";

/**
 * Logo handling for the template picker.
 *
 * Same shape and the same hard rule as `app/(portal)/dashboard/new/image.ts`,
 * which this is deliberately modelled on rather than importing: that module
 * belongs to the composer and re-encodes to JPEG, which is wrong for a logo.
 * The rule both files exist to enforce is identical — the output MUST match
 * `data:image/(png|jpeg|webp);base64,`, because that regex in
 * `app/api/generate/route.ts` is the only gate, and anything else is dropped
 * server-side without ever telling the customer their logo was ignored.
 *
 * WHY PNG FIRST
 * A logo is usually flat colour with a transparent background. JPEG has no
 * alpha, so re-encoding one to JPEG paints the transparency black — the exact
 * failure that makes a header lockup look broken. PNG is tried first and kept
 * when it fits; only when it does not does this fall back to JPEG, and then it
 * flattens onto white first so the fallback is white-backed rather than
 * black-backed.
 *
 * WHY THE SIZE CAPS ARE THE BRAND KIT'S
 * `LOGO_LIMITS` in lib/brand-kit.ts carries the arithmetic: a logo is re-sent
 * in the user message of every turn of every build, so its byte size is a
 * recurring cost, not a one-off. 160px on the longest edge renders crisply up
 * to about 80 CSS px — a header lockup at 2x — and keeps the data URI inside
 * 16 KiB. Reusing those constants means this picker cannot quietly disagree
 * with the rest of the product about what a logo costs.
 */

/** Exactly what the generate route will accept as an upload. */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;

/** What the file picker offers. Narrower than `image/*` on purpose — `image/*`
    would offer a phone's HEIC, which then fails to decode. */
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

export type LogoResult =
  | { ok: true; dataUrl: string; name: string; bytes: number; format: "PNG" | "JPEG" }
  | { ok: false; error: string };

const OUTPUT_RE = /^data:image\/(png|jpeg|webp);base64,/;

function bytesOf(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return Math.round((dataUrl.length - comma - 1) * 0.75);
}

export async function prepareLogo(file: File): Promise<LogoResult> {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error:
        "That file can't be used as a logo. Kodely accepts PNG, JPEG and WebP images — an SVG, PDF or HEIC will be rejected by the builder, so it is refused here instead of failing silently later.",
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const edge = LOGO_LIMITS.RASTER_MAX_EDGE;
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "This browser couldn't read that image." };
    ctx.drawImage(bitmap, 0, 0, w, h);

    let dataUrl = canvas.toDataURL("image/png");
    let format: "PNG" | "JPEG" = "PNG";

    if (dataUrl.length > LOGO_LIMITS.RASTER_DATA_URI_MAX) {
      // Flatten onto white before the JPEG pass: JPEG has no alpha, and an
      // un-flattened transparent logo encodes as black.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      format = "JPEG";
    }

    bitmap.close();

    if (!OUTPUT_RE.test(dataUrl)) {
      return { ok: false, error: "This browser couldn't re-encode that image." };
    }
    if (dataUrl.length > LOGO_LIMITS.RASTER_DATA_URI_MAX) {
      const kb = Math.round(LOGO_LIMITS.RASTER_DATA_URI_MAX / 1024);
      return {
        ok: false,
        error: `That image is still over ${kb} KB after resizing, which is too detailed to be a logo. A photograph won't work here — try a flat mark, or crop it tighter.`,
      };
    }

    return { ok: true, dataUrl, name: file.name, bytes: bytesOf(dataUrl), format };
  } catch {
    return { ok: false, error: "That image couldn't be read. Try a different file." };
  }
}

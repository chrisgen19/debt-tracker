/**
 * Shrink a picked image in the browser before it is uploaded.
 *
 * Three things fall out of doing this client-side, and all of them matter here:
 * a phone photo drops from several MB to a couple of hundred KB so an upload finishes
 * on mobile data, R2 usage stays inside the free tier, and re-encoding through a
 * canvas discards EXIF, which on a phone photo of a receipt includes GPS coordinates
 * of where it was taken. Nobody attaching a GCash screenshot expects to publish their
 * home address along with it.
 *
 * Fails closed. Returning the original on error would quietly ship the EXIF this
 * function exists to remove, and the caller would have no way to know it happened, so
 * a file that cannot be re-encoded is refused instead.
 */

/** Long edge, in pixels. A receipt stays comfortably legible well below this. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // Revoked after decode: the bitmap is already in memory, and leaving the object
    // URL alive holds the whole file for the life of the document.
    URL.revokeObjectURL(url);
  }
}

export type DownscaledImage =
  | { ok: true; blob: Blob; contentType: "image/jpeg" }
  | { ok: false; error: string };

const UNREADABLE = "That image could not be read. Try a JPEG, PNG or WebP.";

export async function downscaleImage(file: File): Promise<DownscaledImage> {
  try {
    const image = await decode(file);
    const { width, height } = scaledSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, error: UNREADABLE };
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size === 0) return { ok: false, error: UNREADABLE };
    // Always the re-encode, even where it comes out slightly larger than a small PNG
    // screenshot would have. Preferring the smaller file meant handing back the
    // original untouched, metadata and all, in the most common case of the lot.
    return { ok: true, blob, contentType: "image/jpeg" };
  } catch {
    return { ok: false, error: UNREADABLE };
  }
}

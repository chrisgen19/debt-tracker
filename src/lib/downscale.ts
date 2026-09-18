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
 * Falls back to the original file whenever the browser cannot decode it, so a picked
 * image is never silently lost.
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

export type DownscaledImage = { blob: Blob; contentType: string };

export async function downscaleImage(file: File): Promise<DownscaledImage> {
  const original: DownscaledImage = { blob: file, contentType: file.type };
  try {
    const image = await decode(file);
    const { width, height } = scaledSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return original;
    // A small PNG screenshot can come back larger as a JPEG. Keep whichever is smaller,
    // but only when the original was already an allowed type.
    if (blob.size >= file.size && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
      return original;
    }
    return { blob, contentType: "image/jpeg" };
  } catch {
    return original;
  }
}

/**
 * Pure receipt-upload rules, shared by the browser and the server.
 *
 * The browser checks these before asking for a presigned URL so a bad pick fails
 * instantly instead of after an upload round trip. The server checks them again on
 * the way in, because a client-side check is a convenience, never a control.
 */

/**
 * What R2 is allowed to receive. Deliberately narrow: these three all render in an
 * `<img>` on every browser the app supports, so a stored receipt can never turn out
 * to be unviewable. HEIC is absent on purpose, since the client downscale re-encodes
 * an iPhone photo to JPEG before it ever gets here.
 */
export const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ReceiptContentType = (typeof ALLOWED_RECEIPT_TYPES)[number];

/**
 * Ceiling on a single upload. The client downscale lands a phone photo around
 * 150-300KB, so 5MB is headroom for an odd screenshot rather than a target.
 */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<ReceiptContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ReceiptValidation =
  | { ok: true; contentType: ReceiptContentType }
  | { ok: false; error: string };

function isAllowedType(value: string): value is ReceiptContentType {
  return (ALLOWED_RECEIPT_TYPES as readonly string[]).includes(value);
}

/**
 * Gate a proposed upload on its declared type and size.
 *
 * `size` is what the browser reports, so it is a cheap early reject rather than a
 * guarantee. The authoritative size is read back from R2 with HeadObject once the
 * object actually exists.
 */
export function validateReceiptUpload(input: { contentType: string; size: number }): ReceiptValidation {
  if (!isAllowedType(input.contentType)) {
    return { ok: false, error: "Receipts must be a JPEG, PNG or WebP image" };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "That file looks empty" };
  }
  if (input.size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: `Receipts must be under ${Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024)}MB` };
  }
  return { ok: true, contentType: input.contentType };
}

/**
 * Where the object lives in the bucket.
 *
 * The household prefix makes a misrouted object obvious when browsing the bucket and
 * gives a per-household lifecycle rule something to match. The cuid carries the
 * unguessability: nothing about a key can be derived from an entry the viewer can see.
 */
export function receiptKey(householdId: string, receiptId: string, contentType: ReceiptContentType): string {
  return `receipts/${householdId}/${receiptId}.${EXTENSIONS[contentType]}`;
}

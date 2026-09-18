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
/**
 * Where the object lives in the bucket.
 *
 * The household prefix makes a misrouted object obvious when browsing the bucket and
 * gives a per-household lifecycle rule something to match. `token` carries the
 * unguessability, and is deliberately not the row id: the key has to be final at insert
 * time, because `Receipt.key` is unique and a placeholder written now and corrected a
 * statement later collides between two concurrent reservations.
 */
export function receiptKey(prefix: string, householdId: string, token: string, contentType: ReceiptContentType): string {
  return `${prefix}${CONFIRMED_ROOT}${householdId}/${token}.${EXTENSIONS[contentType]}`;
}

const CONFIRMED_ROOT = "receipts/";
const STAGING_ROOT = "staging/";

/**
 * Where an upload lands before it has been checked.
 *
 * Uploads go here and are copied to the real key once confirmed. A presigned PUT stays
 * usable until it expires, so a URL that could write the final key would let a caller
 * swap the bytes *after* they were accepted, leaving the stored proof different from
 * the proof that was approved. Nothing is ever presigned for writing at the final key.
 *
 * Staging is a *leading* prefix, not a folder nested under the household. An R2
 * lifecycle rule filters on the start of the key, so `receipts/<household>/staging/...`
 * would need one rule per household and in practice match nothing. This way a single
 * rule on `staging/` expires every abandoned upload there will ever be.
 */
export function stagingReceiptKey(prefix: string, householdId: string, token: string, contentType: ReceiptContentType): string {
  return `${prefix}${STAGING_ROOT}${householdId}/${token}.${EXTENSIONS[contentType]}`;
}

/**
 * The immutable key a staged object is promoted to.
 *
 * Anchored on the prefix rather than searching for the segment, so it swaps the one
 * `staging/` that this key was actually built with and cannot be fooled by the word
 * turning up anywhere else in the path.
 */
export function promotedKey(prefix: string, stagingKey: string): string {
  const staged = `${prefix}${STAGING_ROOT}`;
  return stagingKey.startsWith(staged)
    ? `${prefix}${CONFIRMED_ROOT}${stagingKey.slice(staged.length)}`
    : stagingKey;
}

/**
 * Normalise a configured key prefix.
 *
 * Local development and production share one bucket, and nothing in a key says which
 * wrote it. A prefix keeps them in separate trees so a cleanup script, a reset or a
 * stray test can never reach the other one's objects. Production leaves this empty,
 * which keeps every key already in the bucket exactly where it is.
 */
export function normalizeKeyPrefix(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error("R2_KEY_PREFIX must be lowercase letters, digits and dashes, for example \"dev\"");
  }
  return `${trimmed}/`;
}

const SIGNATURES: { type: ReceiptContentType; match: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", match: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  // RIFF....WEBP
  { type: "image/webp", match: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

/** Bytes needed to identify any allowed type. WebP needs the longest look. */
export const IMAGE_SNIFF_BYTES = 12;

/**
 * Identify an image from its leading bytes.
 *
 * The presigned PUT pins the `Content-Type` *header*, not the body, so a household
 * member could sign an image slot and push arbitrary bytes into it. This is what makes
 * the stored object prove its own type instead of being taken at its word.
 */
export function sniffImageType(bytes: Uint8Array): ReceiptContentType | null {
  if (bytes.length < IMAGE_SNIFF_BYTES) return null;
  return SIGNATURES.find((signature) => signature.match(bytes))?.type ?? null;
}

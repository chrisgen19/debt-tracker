import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ReceiptContentType } from "./receipts";

/**
 * Cloudflare R2 access for receipt images.
 *
 * Server only. There is no `server-only` package in this project, so the guard below
 * stands in for it: importing this from a client component would otherwise fail much
 * later and much less clearly, with an undefined secret rather than a stack trace.
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/r2.ts is server-only and must not be imported from the browser");
}

/**
 * Both directions expire fast. An upload URL only has to outlive one PUT, and a view
 * URL only has to outlive the image load, so a link copied out of devtools is dead
 * long before it could be passed around. R2 permits up to 7 days; we want nothing
 * like it.
 */
const SIGNED_URL_TTL_SECONDS = 300;

type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cached: { config: R2Config; client: S3Client } | null = null;

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

/**
 * Whether receipts can be stored at all.
 *
 * Receipts are an optional extra on top of a ledger that has to keep working, so a
 * missing bucket hides the upload UI rather than breaking the dashboard. That also
 * makes the feature safe to merge before production has the credentials.
 */
export function isReceiptStorageConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * Lazily built, then cached for the life of the process.
 *
 * Deliberately not constructed at module load, unlike the Prisma client: the database
 * is load-bearing for every page, whereas R2 is not, and throwing here at import time
 * would take the whole dashboard down over an optional feature.
 */
function storage(): { client: S3Client; bucket: string } {
  const config = readConfig();
  if (!config) {
    throw new Error("Receipt storage is not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  if (!cached || cached.config.accountId !== config.accountId || cached.config.bucket !== config.bucket) {
    cached = {
      config,
      client: new S3Client({
        // R2 ignores the region but the SDK refuses to sign without one.
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
    };
  }
  return { client: cached.client, bucket: config.bucket };
}

/**
 * A URL the browser can PUT one image to, straight to R2.
 *
 * Both the type and the exact length are part of the signature, so the browser has to
 * match them or R2 answers 403. The length matters most: signup is open, so anyone can
 * reach this, and without a signed length a caller could declare a small upload and
 * then PUT gigabytes. R2 refuses the mismatch outright, which means the ceiling is
 * enforced at upload time rather than at a confirmation step an abuser can simply skip.
 */
export function presignReceiptPut(key: string, contentType: ReceiptContentType, contentLength: number): Promise<string> {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
    {
      expiresIn: SIGNED_URL_TTL_SECONDS,
      // Without this the SDK signs `host` alone and both values become hints the
      // uploader is free to ignore, while the PUT still succeeds.
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
}

/**
 * Copy a checked object to its final key and drop the staging copy.
 *
 * The final key is never handed out as a presigned PUT, so once an object lands here
 * the bytes behind a confirmed receipt cannot be swapped for different ones.
 */
export async function promoteReceiptObject(fromKey: string, toKey: string): Promise<boolean> {
  const { client, bucket } = storage();
  try {
    await client.send(new CopyObjectCommand({ Bucket: bucket, Key: toKey, CopySource: `${bucket}/${fromKey}` }));
  } catch {
    return false;
  }
  await deleteReceiptObject(fromKey);
  return true;
}

/** A short-lived URL for reading one image back, handed out only after an auth check. */
export function presignReceiptGet(key: string): Promise<string> {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

/**
 * Read the first bytes of an object, so its type can be checked against its content
 * rather than against the header the uploader claimed. A ranged GET, so this costs
 * twelve bytes rather than the whole image.
 */
export async function receiptObjectPrefix(key: string, length: number): Promise<Uint8Array | null> {
  const { client, bucket } = storage();
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }));
    const bytes = await object.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

/** Remove an object. Used to take back a rejected upload rather than leave it paid for. */
export async function deleteReceiptObject(key: string): Promise<void> {
  const { client, bucket } = storage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best effort: a failed cleanup must not mask the rejection that triggered it.
  }
}

/**
 * Confirm an object really landed, and report how big it actually is.
 *
 * This is what stops a caller linking an entry to a receipt that was never uploaded:
 * the browser could always claim success, R2 is the only witness that counts.
 * Returns null when the object is absent for any reason.
 */
export async function receiptObjectSize(key: string): Promise<number | null> {
  const { client, bucket } = storage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch {
    return null;
  }
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { createReceiptUpload } from "@/app/actions";
import { downscaleImage } from "@/lib/downscale";
import { MAX_RECEIPT_BYTES, validateReceiptUpload } from "@/lib/receipts";
import { cn } from "@/lib/utils";

/**
 * Pick a receipt image, shrink it, upload it straight to R2, and report the id.
 *
 * The upload runs as soon as a file is picked rather than on submit, so the slow part
 * overlaps with the rest of the form being filled in. `onChange` fires with the receipt
 * id once the bytes are in the bucket, and the parent sends only that id to the server.
 *
 * Receipts are optional everywhere they appear, so every failure here is recoverable:
 * an error leaves the field empty and the surrounding form still submits.
 */
type Props = {
  receiptId: string | null;
  onChange: (receiptId: string | null) => void;
  disabled?: boolean;
  label?: string;
};

export function ReceiptField({ receiptId, onChange, disabled, label = "Attach a receipt" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The thumbnail is a blob URL for the local file, so it needs no round trip and is
  // there before the upload finishes. Tagged with the receipt it belongs to: `receiptId`
  // is the parent's, so a parent that clears it must clear this too, and deriving that
  // rather than syncing it in an effect means there is no window where the field shows
  // a thumbnail for a receipt its owner has already discarded.
  const [attached, setAttached] = useState<{ id: string; preview: string } | null>(null);
  const shown = attached && attached.id === receiptId ? attached : null;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (attached) URL.revokeObjectURL(attached.preview); }, [attached]);

  // The native input keeps its own value, which React cannot derive away. Left set, it
  // stops the very same file being picked again after a clear.
  useEffect(() => { if (!shown && inputRef.current) inputRef.current.value = ""; }, [shown]);

  function reset() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function pick(file: File) {
    setError("");
    setUploading(true);
    try {
      const reduced = await downscaleImage(file);
      if (!reduced.ok) { setError(reduced.error); return; }
      const { blob, contentType } = reduced;
      const valid = validateReceiptUpload({ contentType, size: blob.size });
      if (!valid.ok) { setError(valid.error); return; }

      const ticket = await createReceiptUpload({ contentType, size: blob.size });
      if (!ticket.ok) { setError(ticket.error); return; }

      // Straight to R2. The Content-Type has to match what was signed exactly, or R2
      // rejects the PUT with a 403 rather than a readable error.
      const response = await fetch(ticket.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!response.ok) { setError("The upload did not go through. Check your connection and try again."); return; }

      setAttached({ id: ticket.receiptId, preview: URL.createObjectURL(blob) });
      onChange(ticket.receiptId);
    } catch {
      setError("The upload did not go through. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || disabled;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void pick(file); }}
      />

      {shown ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not a remote asset for next/image to optimise */}
          <img src={shown.preview} alt="Receipt preview" className="size-14 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Receipt attached</p>
            <p className="text-xs text-muted-foreground">Saved with this entry</p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            aria-label="Remove receipt"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-left transition-colors",
            !busy && "hover:border-primary/50 hover:bg-secondary/60",
            busy && "opacity-60",
          )}
        >
          {uploading ? <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" /> : <ImagePlus className="size-5 shrink-0 text-primary" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{uploading ? "Uploading receipt" : label}</span>
            <span className="block text-xs text-muted-foreground">
              Optional. JPEG, PNG or WebP up to {Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024)}MB
            </span>
          </span>
        </button>
      )}

      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

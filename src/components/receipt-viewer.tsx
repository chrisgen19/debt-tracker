"use client";

import { useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useSheetDialog } from "@/lib/use-sheet-dialog";

/**
 * Full-size look at one receipt.
 *
 * The `src` is this app's own authenticated route, not R2: the bucket is private, so
 * `/api/receipts/<id>` checks the session and the household and only then redirects to
 * a short-lived signed URL. That also keeps the image same-origin, which is why no
 * `images.remotePatterns` entry is needed in next.config.ts.
 */
type Props = {
  receiptId: string | null;
  title: string;
  onClose: () => void;
};

export function ReceiptViewer({ receiptId, title, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Tagged with the receipt it describes, and reset during render when that changes,
  // matching how LedgerCard discards a selection on a view change. An effect would be
  // one render late, which is long enough to flash the previous receipt.
  const [loaded, setLoaded] = useState<{ id: string | null; state: "loading" | "ready" | "failed" }>({ id: receiptId, state: "loading" });
  const state = loaded.id === receiptId ? loaded.state : "loading";
  if (loaded.id !== receiptId) setLoaded({ id: receiptId, state: "loading" });
  useSheetDialog(dialogRef, receiptId !== null, onClose);

  return (
    <dialog ref={dialogRef} className="sheet" aria-label={title}>
      <div className="sheet-panel overflow-hidden rounded-t-[2rem] bg-card shadow-2xl sm:rounded-[2rem]">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close receipt"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid max-h-[70svh] min-h-40 place-items-center overflow-auto bg-secondary/40 p-4">
          {/* `key` remounts on a new receipt so the loading state restarts rather than
              showing the previous image while the next one fetches. */}
          {receiptId && (
            <>
              {state === "loading" && <LoaderCircle className="size-6 animate-spin text-muted-foreground" />}
              {state === "failed" && (
                <p role="alert" className="px-4 py-8 text-center text-sm font-medium text-muted-foreground">
                  This receipt could not be loaded.
                </p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- served through an auth-checked redirect, which next/image cannot follow */}
              <img
                key={receiptId}
                src={`/api/receipts/${receiptId}`}
                alt={title}
                onLoad={() => setLoaded({ id: receiptId, state: "ready" })}
                onError={() => setLoaded({ id: receiptId, state: "failed" })}
                className={state === "ready" ? "max-h-full w-auto rounded-xl" : "hidden"}
              />
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

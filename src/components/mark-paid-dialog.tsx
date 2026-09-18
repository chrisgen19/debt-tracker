"use client";

import { useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptField } from "@/components/receipt-field";
import { useSheetDialog } from "@/lib/use-sheet-dialog";
import { formatMoney } from "@/lib/utils";

/**
 * Asks for proof of payment on the way to marking entries paid.
 *
 * One dialog serves both the single-row button and the selection bar's bulk action, so
 * the two paths cannot drift. For a bulk settle it uploads exactly one image and hands
 * back one receipt id: a single GCash transfer clearing three debts is one screenshot,
 * not three.
 *
 * The receipt is optional, so Skip is a first-class way out rather than a cancel. There
 * is no confirmation step for marking entries *unpaid*, which stays a single click.
 */
type Props = {
  /** Ids about to be settled. Empty closes the dialog. */
  ids: string[];
  total: number;
  currency: string;
  pending: boolean;
  /** False when R2 is unconfigured: the dialog becomes a plain confirm. */
  receiptsEnabled: boolean;
  onConfirm: (receiptId: string | null) => void;
  onClose: () => void;
};

export function MarkPaidDialog({ ids, total, currency, pending, receiptsEnabled, onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const open = ids.length > 0;

  // Cleared as the dialog opens, not as it closes. Dismissing with Esc or a click
  // outside skips `confirm`, so without this a receipt attached and then abandoned
  // would still be sitting there on the next open, ready to be filed against an
  // entirely different set of entries. Resetting on the way in also leaves the
  // thumbnail in place through the exit transition.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setReceiptId(null);
  }

  useSheetDialog(dialogRef, open, onClose);

  const count = ids.length;
  const heading = count === 1 ? "Mark this entry paid" : `Mark ${count} entries paid`;

  function confirm(id: string | null) {
    onConfirm(id);
    setReceiptId(null);
  }

  return (
    <dialog ref={dialogRef} className="sheet" aria-label={heading}>
      <div className="sheet-panel rounded-t-[2rem] bg-card p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">{heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMoney(total, currency)} in total.
          {receiptsEnabled ? " Add a GCash or Maribank screenshot as proof, or skip it." : ""}
        </p>

        {receiptsEnabled && (
          <div className="mt-5">
            <ReceiptField
              receiptId={receiptId}
              onChange={setReceiptId}
              disabled={pending}
              label="Attach proof of payment"
            />
          </div>
        )}

        {/* Two full-width buttons on a phone, side by side from `sm` up, matching how
            the selection bar handles the same constraint. */}
        <div className={`mt-6 grid gap-2 ${receiptsEnabled ? "sm:grid-cols-2" : ""}`}>
          {receiptsEnabled && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => confirm(null)}
              className="w-full sm:order-1"
            >
              Skip for now
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={() => confirm(receiptId)}
            className="w-full sm:order-2"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            {pending ? "Saving" : "Mark paid"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

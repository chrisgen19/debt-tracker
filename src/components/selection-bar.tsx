"use client";

import { Check, ListChecks, Trash2, Undo2, X } from "lucide-react";
import type { SelectionSummary } from "@/lib/selection";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Floating action bar for the ledger's selection mode. It sits above the mobile
 * bottom nav, which owns `bottom-0` up to the `md` breakpoint.
 *
 * Sticky rather than fixed: a fixed bar is outside the flow, so it covered the
 * last rows of the ledger with no way to scroll them clear. Sticky reserves its
 * own height in the flow, so the list can always be scrolled past it, whatever
 * the bar grows to at that width.
 */
export function SelectionBar({ selection, currency, settled, pending, allSelected, onSelectAll, onMarkPaid, onMarkUnpaid, onDelete, onClear }: {
  selection: SelectionSummary;
  currency: string;
  /** Every row in a paid view is settled, so its totals are payments, not debts. */
  settled: boolean;
  pending: boolean;
  allSelected: boolean;
  onSelectAll: () => void;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (!selection.count) return null;
  const bothStatuses = selection.toPay.length > 0 && selection.toUnpay.length > 0;
  return (
    <div
      role="region"
      aria-label="Selected entries"
      className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 mt-4 md:bottom-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card/97 p-3 shadow-[0_16px_40px_rgba(0,0,0,.16)] backdrop-blur sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">
              {selection.count} selected
              {selection.hiddenCount > 0 && <span className="font-semibold normal-case tracking-normal"> · {selection.hiddenCount} hidden by filters</span>}
            </p>
            <button
              type="button"
              onClick={onSelectAll}
              className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold text-primary hover:bg-[#dcebdc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ListChecks className="size-3.5" />
              {allSelected ? "Clear" : "Select all"}
            </button>
          </div>
          <p className="font-display text-xl font-semibold">{formatMoney(selection.total, currency)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {settled ? "you paid" : "you owe"} {formatMoney(selection.youOwe, currency)} · {settled ? "paid to you" : "owed to you"} {formatMoney(selection.owedToYou, currency)}
          </p>
        </div>

        {/* Four actions cannot sit on one phone-width line. A grid gives each a
            full-width tap target instead of hiding the last ones off the edge,
            and wrapping keeps that true at any width the row does still fit. */}
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {selection.toPay.length > 0 && (
            <Button size="sm" disabled={pending} onClick={onMarkPaid} className="w-full sm:w-auto">
              <Check className="size-4" />
              <ActionLabel short="Paid" full="Mark paid" count={selection.toPay.length} />
            </Button>
          )}
          {selection.toUnpay.length > 0 && (
            <Button size="sm" variant="outline" disabled={pending} onClick={onMarkUnpaid} className="w-full sm:w-auto">
              <Undo2 className="size-4" />
              <ActionLabel short="Unpaid" full="Mark unpaid" count={selection.toUnpay.length} />
            </Button>
          )}
          {/* With both mark actions filling the first row, Delete would sit alone
              in half of the second. Let it span instead of leaving a gap. */}
          <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete} className={`w-full sm:w-auto ${bothStatuses ? "col-span-2" : ""}`}>
            <Trash2 className="size-4" />Delete ({selection.count})
          </Button>
          <Button size="sm" variant="ghost" aria-label="Cancel selection" disabled={pending} onClick={onClear} className="col-span-2 w-full sm:w-auto sm:px-2">
            <X className="size-4" />
            <span className="sm:hidden">Cancel</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Drops the "Mark " prefix on phones, where the four actions have to share two columns. */
function ActionLabel({ short, full, count }: { short: string; full: string; count: number }) {
  return (
    <>
      <span className="sm:hidden">{short} ({count})</span>
      <span className="hidden sm:inline">{full} ({count})</span>
    </>
  );
}

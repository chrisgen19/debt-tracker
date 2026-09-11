"use client";

import { Check, ListChecks, Trash2, Undo2, X } from "lucide-react";
import type { SelectionSummary } from "@/lib/selection";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Floating action bar for the ledger's selection mode. It sits above the mobile
 * bottom nav, which owns `bottom-0` up to the `md` breakpoint.
 */
export function SelectionBar({ selection, currency, pending, allSelected, onSelectAll, onMarkPaid, onMarkUnpaid, onDelete, onClear }: {
  selection: SelectionSummary;
  currency: string;
  pending: boolean;
  allSelected: boolean;
  onSelectAll: () => void;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (!selection.count) return null;
  return (
    <div
      role="region"
      aria-label="Selected entries"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 px-4 md:bottom-6"
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
            you owe {formatMoney(selection.youOwe, currency)} · owed to you {formatMoney(selection.owedToYou, currency)}
          </p>
        </div>

        <div className="-mx-1 flex shrink-0 items-center gap-2 overflow-x-auto px-1 pb-0.5">
          {selection.toPay.length > 0 && (
            <Button size="sm" disabled={pending} onClick={onMarkPaid} className="shrink-0">
              <Check className="size-4" />Mark paid ({selection.toPay.length})
            </Button>
          )}
          {selection.toUnpay.length > 0 && (
            <Button size="sm" variant="outline" disabled={pending} onClick={onMarkUnpaid} className="shrink-0">
              <Undo2 className="size-4" />Mark unpaid ({selection.toUnpay.length})
            </Button>
          )}
          <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete} className="shrink-0">
            <Trash2 className="size-4" />Delete ({selection.count})
          </Button>
          <Button size="sm" variant="ghost" aria-label="Cancel selection" disabled={pending} onClick={onClear} className="shrink-0 px-2">
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

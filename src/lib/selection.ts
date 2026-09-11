export type SelectableDebt = {
  id: string;
  amount: number;
  status: "DEBT" | "PAID";
  lender: { id: string };
  borrower: { id: string };
};

export type SelectionSummary = {
  /** Selected ids that still exist in the loaded list, in list order. */
  ids: string[];
  count: number;
  /** Plain sum of every selected amount, regardless of direction. */
  total: number;
  youOwe: number;
  owedToYou: number;
  /** Selected ids that can still be settled. */
  toPay: string[];
  /** Selected ids that can be moved back to debt. */
  toUnpay: string[];
  /** Selected but filtered out of view, so the bar can say the action reaches further than the list. */
  hiddenCount: number;
};

/**
 * Adds or removes one group of ids, leaving every other selected id untouched.
 * The ledger's "Select all" is scoped to the filtered list, so it must not
 * disturb a selection the current filter happens to be hiding. Clearing the
 * whole selection is a separate control.
 */
export function setSelectionFor(current: ReadonlySet<string>, ids: string[], selected: boolean): ReadonlySet<string> {
  const next = new Set(current);
  ids.forEach((id) => { if (selected) next.add(id); else next.delete(id); });
  return next;
}

/**
 * Resolves a set of selected ids against the entries actually loaded for the
 * current view. Deriving the summary from the entries rather than from the
 * selection itself means ids can never outlive the rows they came from: when the
 * view's data changes, stale ids simply drop out.
 */
export function summarizeSelection<T extends SelectableDebt>(
  entries: T[],
  selected: ReadonlySet<string>,
  visibleIds: ReadonlySet<string>,
  currentUserId: string,
): SelectionSummary {
  const summary: SelectionSummary = {
    ids: [], count: 0, total: 0, youOwe: 0, owedToYou: 0, toPay: [], toUnpay: [], hiddenCount: 0,
  };
  entries.forEach((entry) => {
    if (!selected.has(entry.id)) return;
    summary.ids.push(entry.id);
    summary.total += entry.amount;
    if (entry.borrower.id === currentUserId) summary.youOwe += entry.amount;
    if (entry.lender.id === currentUserId) summary.owedToYou += entry.amount;
    if (entry.status === "DEBT") summary.toPay.push(entry.id); else summary.toUnpay.push(entry.id);
    if (!visibleIds.has(entry.id)) summary.hiddenCount += 1;
  });
  summary.count = summary.ids.length;
  return summary;
}

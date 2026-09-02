export type LedgerMode = "MONTH" | "OPEN" | "PAID_MONTH" | "PAID_ALL";
export type DirectionFilter = "ALL" | "YOU_OWE" | "OWED_TO_YOU";
export type LedgerStatusFilter = "ALL" | "DEBT" | "PAID";

/** The three settled/open views are already status-homogeneous, so only the month view filters on status. */
export function isPaidMode(mode: LedgerMode) {
  return mode === "PAID_MONTH" || mode === "PAID_ALL";
}

type FilterableDebt = {
  itemName: string;
  category: string;
  notes: string | null;
  status: "DEBT" | "PAID";
  lender: { id: string; name: string };
  borrower: { id: string; name: string };
};

export function filterLedgerEntries<T extends FilterableDebt>(entries: T[], options: {
  mode: LedgerMode;
  status: LedgerStatusFilter;
  direction: DirectionFilter;
  currentUserId: string;
  search: string;
}) {
  const term = options.search.trim().toLowerCase();
  return entries.filter((debt) => {
    const matchesStatus = options.mode !== "MONTH" || options.status === "ALL" || debt.status === options.status;
    const matchesDirection = options.mode === "MONTH" || options.direction === "ALL"
      || (options.direction === "YOU_OWE" && debt.borrower.id === options.currentUserId)
      || (options.direction === "OWED_TO_YOU" && debt.lender.id === options.currentUserId);
    const matchesSearch = !term
      || `${debt.itemName} ${debt.category} ${debt.notes ?? ""} ${debt.borrower.name} ${debt.lender.name}`.toLowerCase().includes(term);
    return matchesStatus && matchesDirection && matchesSearch;
  });
}

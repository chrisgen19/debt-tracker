export type LedgerMode = "MONTH" | "OPEN";
export type DirectionFilter = "ALL" | "YOU_OWE" | "OWED_TO_YOU";
export type LedgerStatusFilter = "ALL" | "DEBT" | "PAID";

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
    const matchesStatus = options.mode === "OPEN" || options.status === "ALL" || debt.status === options.status;
    const matchesDirection = options.mode === "MONTH" || options.direction === "ALL"
      || (options.direction === "YOU_OWE" && debt.borrower.id === options.currentUserId)
      || (options.direction === "OWED_TO_YOU" && debt.lender.id === options.currentUserId);
    const matchesSearch = !term
      || `${debt.itemName} ${debt.category} ${debt.notes ?? ""} ${debt.borrower.name} ${debt.lender.name}`.toLowerCase().includes(term);
    return matchesStatus && matchesDirection && matchesSearch;
  });
}

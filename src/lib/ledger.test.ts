import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterLedgerEntries } from "./ledger";

const entries = [
  { itemName: "Dinner", category: "Food", notes: "Anniversary", status: "DEBT" as const, borrower: { id: "me", name: "Chris" }, lender: { id: "partner", name: "Pat" } },
  { itemName: "Medicine", category: "Health", notes: null, status: "DEBT" as const, borrower: { id: "partner", name: "Pat" }, lender: { id: "me", name: "Chris" } },
  { itemName: "Coffee", category: "Food", notes: null, status: "PAID" as const, borrower: { id: "me", name: "Chris" }, lender: { id: "partner", name: "Pat" } },
];

describe("filterLedgerEntries", () => {
  it("filters the all-unpaid view by debt direction", () => {
    const result = filterLedgerEntries(entries.filter((entry) => entry.status === "DEBT"), {
      mode: "OPEN", status: "ALL", direction: "YOU_OWE", currentUserId: "me", search: "",
    });
    assert.deepEqual(result.map((entry) => entry.itemName), ["Dinner"]);
  });

  it("searches item, category, notes, and people", () => {
    const byNote = filterLedgerEntries(entries, { mode: "MONTH", status: "ALL", direction: "ALL", currentUserId: "me", search: "anniversary" });
    const byCategory = filterLedgerEntries(entries, { mode: "MONTH", status: "ALL", direction: "ALL", currentUserId: "me", search: "health" });
    assert.deepEqual(byNote.map((entry) => entry.itemName), ["Dinner"]);
    assert.deepEqual(byCategory.map((entry) => entry.itemName), ["Medicine"]);
  });

  it("keeps the monthly status filter independent from the open direction filter", () => {
    const paid = filterLedgerEntries(entries, { mode: "MONTH", status: "PAID", direction: "YOU_OWE", currentUserId: "me", search: "" });
    assert.deepEqual(paid.map((entry) => entry.itemName), ["Coffee"]);
  });
});

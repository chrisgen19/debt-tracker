import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setSelectionFor, summarizeSelection } from "./selection";

const entries = [
  { id: "dinner", amount: 450, status: "DEBT" as const, borrower: { id: "me" }, lender: { id: "partner" } },
  { id: "medicine", amount: 350, status: "DEBT" as const, borrower: { id: "partner" }, lender: { id: "me" } },
  { id: "coffee", amount: 120, status: "PAID" as const, borrower: { id: "me" }, lender: { id: "partner" } },
];
const allVisible = new Set(entries.map((entry) => entry.id));

describe("summarizeSelection", () => {
  it("sums the selection and splits it by direction", () => {
    const summary = summarizeSelection(entries, new Set(["dinner", "medicine"]), allVisible, "me");
    assert.equal(summary.count, 2);
    assert.equal(summary.total, 800);
    assert.equal(summary.youOwe, 450);
    assert.equal(summary.owedToYou, 350);
  });

  it("splits a mixed selection into what can be paid and what can be un-paid", () => {
    const summary = summarizeSelection(entries, new Set(["dinner", "medicine", "coffee"]), allVisible, "me");
    assert.deepEqual(summary.toPay, ["dinner", "medicine"]);
    assert.deepEqual(summary.toUnpay, ["coffee"]);
  });

  it("counts selected entries that a filter has hidden from the list", () => {
    const summary = summarizeSelection(entries, new Set(["dinner", "coffee"]), new Set(["dinner"]), "me");
    assert.equal(summary.count, 2);
    assert.equal(summary.hiddenCount, 1);
    assert.deepEqual(summary.ids, ["dinner", "coffee"]);
  });

  it("drops ids that are no longer in the loaded list", () => {
    const summary = summarizeSelection(entries, new Set(["dinner", "deleted"]), allVisible, "me");
    assert.deepEqual(summary.ids, ["dinner"]);
    assert.equal(summary.total, 450);
  });

  it("returns an empty summary when nothing is selected", () => {
    const summary = summarizeSelection(entries, new Set(), allVisible, "me");
    assert.equal(summary.count, 0);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.toPay, []);
  });
});

describe("setSelectionFor", () => {
  it("adds the given ids without disturbing a selection a filter is hiding", () => {
    const next = setSelectionFor(new Set(["hidden"]), ["dinner", "medicine"], true);
    assert.deepEqual([...next].sort(), ["dinner", "hidden", "medicine"]);
  });

  it("removes only the given ids, so a filtered clear keeps hidden entries selected", () => {
    const next = setSelectionFor(new Set(["hidden", "dinner"]), ["dinner"], false);
    assert.deepEqual([...next], ["hidden"]);
  });

  it("leaves the original set untouched", () => {
    const current = new Set(["dinner"]);
    setSelectionFor(current, ["coffee"], true);
    assert.deepEqual([...current], ["dinner"]);
  });
});

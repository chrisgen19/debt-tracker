import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAmount } from "./amount";

describe("sanitizeAmount", () => {
  it("preserves comma decimals on comma-decimal devices", () => {
    assert.equal(sanitizeAmount("12,50", ","), "12.50");
  });

  it("preserves common Philippine grouping and decimal input", () => {
    assert.equal(sanitizeAmount("1,000", "."), "1000");
    assert.equal(sanitizeAmount("1,234.56", "."), "1234.56");
  });

  it("normalizes mixed European grouping and decimals", () => {
    assert.equal(sanitizeAmount("1.234,56", ","), "1234.56");
  });

  it("respects dot grouping on comma-decimal devices", () => {
    assert.equal(sanitizeAmount("1.000", ","), "1000");
    assert.equal(sanitizeAmount("12.50", ","), "12.50");
  });

  it("removes insignificant leading zeroes before limiting whole digits", () => {
    assert.equal(sanitizeAmount("00012345678", "."), "12345678");
    assert.equal(sanitizeAmount("000000000.50", "."), "0.50");
  });

  it("keeps the existing digit and precision limits", () => {
    assert.equal(sanitizeAmount("12345678901.999", "."), "123456789.99");
  });
});

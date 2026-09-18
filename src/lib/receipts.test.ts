import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_RECEIPT_BYTES, receiptKey, validateReceiptUpload } from "./receipts";

describe("validateReceiptUpload", () => {
  it("accepts the three renderable image types", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      const result = validateReceiptUpload({ contentType, size: 1024 });
      assert.equal(result.ok, true, `${contentType} should be allowed`);
    }
  });

  it("rejects a type that would not render in an img tag", () => {
    const result = validateReceiptUpload({ contentType: "application/pdf", size: 1024 });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /JPEG, PNG or WebP/);
  });

  it("rejects a HEIC straight off an iPhone, which the client re-encodes first", () => {
    assert.equal(validateReceiptUpload({ contentType: "image/heic", size: 1024 }).ok, false);
  });

  it("rejects an empty file", () => {
    const result = validateReceiptUpload({ contentType: "image/jpeg", size: 0 });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /empty/);
  });

  it("rejects a size that is not a real number", () => {
    assert.equal(validateReceiptUpload({ contentType: "image/jpeg", size: Number.NaN }).ok, false);
  });

  it("accepts a file exactly on the size ceiling but not one byte past it", () => {
    assert.equal(validateReceiptUpload({ contentType: "image/jpeg", size: MAX_RECEIPT_BYTES }).ok, true);
    assert.equal(validateReceiptUpload({ contentType: "image/jpeg", size: MAX_RECEIPT_BYTES + 1 }).ok, false);
  });

  it("narrows the content type on success so callers can pass it to receiptKey", () => {
    const result = validateReceiptUpload({ contentType: "image/webp", size: 10 });
    assert.equal(result.ok && result.contentType, "image/webp");
  });
});

describe("receiptKey", () => {
  it("nests the object under its household and names it after the receipt", () => {
    assert.equal(receiptKey("house1", "rec1", "image/jpeg"), "receipts/house1/rec1.jpg");
  });

  it("maps each allowed type to its conventional extension", () => {
    assert.equal(receiptKey("h", "r", "image/png"), "receipts/h/r.png");
    assert.equal(receiptKey("h", "r", "image/webp"), "receipts/h/r.webp");
  });

  it("keeps two receipts in one household on separate keys", () => {
    assert.notEqual(receiptKey("h", "a", "image/jpeg"), receiptKey("h", "b", "image/jpeg"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMAGE_SNIFF_BYTES, MAX_RECEIPT_BYTES, receiptKey, sniffImageType, validateReceiptUpload } from "./receipts";

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

describe("sniffImageType", () => {
  const pad = (head: number[]) => Uint8Array.from([...head, ...Array(IMAGE_SNIFF_BYTES).fill(0)].slice(0, IMAGE_SNIFF_BYTES));

  it("identifies each allowed type from its leading bytes", () => {
    assert.equal(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(
      sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
      "image/webp",
    );
  });

  it("rejects bytes that are not an allowed image, whatever the upload claimed", () => {
    // "<!DOCTYPE h" - the shape of a file smuggled into an image slot.
    assert.equal(sniffImageType(pad([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45])), null);
    assert.equal(sniffImageType(pad([0x25, 0x50, 0x44, 0x46])), null); // %PDF
    assert.equal(sniffImageType(pad([0x50, 0x4b, 0x03, 0x04])), null); // zip
  });

  it("rejects a RIFF container that is not WebP", () => {
    assert.equal(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20])), null);
  });

  it("refuses to guess from too few bytes", () => {
    assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff])), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
  });
});

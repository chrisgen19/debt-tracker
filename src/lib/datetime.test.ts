import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { toInstant, toLocalInput } from "./datetime";

// Node re-reads TZ on assignment, so one process can play both the phone and the
// server. Production's server runs on Asia/Manila.
const originalTz = process.env.TZ;
const STORED = "2026-09-27T15:34:00.000Z"; // Sep 27, 23:34 in Manila

/** What the server stores for a value the form sent, parsed as checkDebtFields does. */
function serverParse(sent: string) {
  process.env.TZ = "Asia/Manila";
  return new Date(sent).toISOString();
}

describe("entry date round trip", () => {
  afterEach(() => { process.env.TZ = originalTz; });

  for (const phone of ["Asia/Manila", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
    it(`keeps the stored instant when a phone on ${phone} saves an untouched date`, () => {
      process.env.TZ = phone;
      const sent = toInstant(toLocalInput(new Date(STORED)));
      assert.equal(serverParse(sent), STORED);
    });
  }

  it("shows the phone's own wall-clock time in the form", () => {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(toLocalInput(new Date(STORED)), "2026-09-27T08:34");
  });

  it("reads a typed time in the phone's timezone, not the server's", () => {
    process.env.TZ = "Asia/Tokyo";
    const sent = toInstant("2026-10-01T00:30");
    assert.equal(serverParse(sent), "2026-09-30T15:30:00.000Z");
  });
});

describe("toInstant", () => {
  it("passes an unparseable value through for the server to reject", () => {
    assert.equal(toInstant(""), "");
    assert.equal(toInstant("not a date"), "not a date");
  });
});

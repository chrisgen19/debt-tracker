import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { calendarDay, clockTime, dayKey, shortDate, toInstant, toLocalInput } from "./datetime";

// Node re-reads TZ on assignment, so one process can play phones in several zones.
// What must never change with it is the output: that is what keeps the server HTML and
// the first client render identical.
const originalTz = process.env.TZ;
const HOUSEHOLD = "Asia/Manila";
const STORED = new Date("2026-09-27T15:34:00.000Z"); // Sep 27, 23:34 in Manila
const DEVICES = ["Asia/Manila", "America/Los_Angeles", "Asia/Tokyo", "UTC"];

afterEach(() => { process.env.TZ = originalTz; });

describe("household-time display", () => {
  it("renders the same day, time and date whatever timezone the device is in", () => {
    const seen = DEVICES.map((device) => {
      process.env.TZ = device;
      return [dayKey(STORED, HOUSEHOLD), clockTime(STORED, HOUSEHOLD), shortDate(STORED, HOUSEHOLD)].join(" | ");
    });
    assert.deepEqual(new Set(seen), new Set(["2026-09-27 | 11:34 PM | Sep 27"]));
  });

  it("puts an instant on the household's calendar day, not UTC's", () => {
    assert.equal(dayKey(new Date("2026-09-20T16:30:00Z"), HOUSEHOLD), "2026-09-21");
    assert.equal(dayKey(new Date("2026-09-20T16:30:00Z"), "America/Los_Angeles"), "2026-09-20");
  });

  it("formats the clock around midnight and noon", () => {
    assert.equal(clockTime(new Date("2026-09-27T16:05:00Z"), HOUSEHOLD), "12:05 AM");
    assert.equal(clockTime(new Date("2026-09-27T04:00:00Z"), HOUSEHOLD), "12:00 PM");
    assert.equal(clockTime(new Date("2026-09-27T01:09:00Z"), HOUSEHOLD), "9:09 AM");
  });

  it("turns a day key back into a date on that same day for any device", () => {
    for (const device of DEVICES) {
      process.env.TZ = device;
      assert.equal(calendarDay("2026-09-21").getDate(), 21);
    }
  });
});

describe("entry form round trip", () => {
  for (const device of DEVICES) {
    it(`keeps the stored instant when a device on ${device} saves an untouched date`, () => {
      process.env.TZ = device;
      assert.equal(toInstant(toLocalInput(STORED, HOUSEHOLD), HOUSEHOLD), STORED.toISOString());
    });
  }

  it("shows the household's wall-clock time in the form, not the device's", () => {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(toLocalInput(STORED, HOUSEHOLD), "2026-09-27T23:34");
  });

  it("reads a typed time as household time", () => {
    process.env.TZ = "Asia/Tokyo";
    assert.equal(toInstant("2026-10-01T00:30", HOUSEHOLD), "2026-09-30T16:30:00.000Z");
    assert.equal(toInstant("2026-10-01T00:30:15", HOUSEHOLD), "2026-09-30T16:30:15.000Z");
  });

  it("uses the offset in force on that date across a daylight-saving change", () => {
    assert.equal(toInstant("2026-03-08T12:00", "America/New_York"), "2026-03-08T16:00:00.000Z");
    assert.equal(toInstant("2026-11-01T12:00", "America/New_York"), "2026-11-01T17:00:00.000Z");
  });

  it("passes an unparseable value through for the server to reject", () => {
    assert.equal(toInstant("", HOUSEHOLD), "");
    assert.equal(toInstant("not a date", HOUSEHOLD), "not a date");
  });
});

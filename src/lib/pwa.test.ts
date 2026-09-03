import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INSTALL_HINT_COOLDOWN_DAYS, isInstallHintSuppressed, isIosDevice, isMacSafari } from "./pwa";

const DAY_MS = 24 * 60 * 60 * 1000;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
const IPADOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0";
const MAC_EDGE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126";

describe("isIosDevice", () => {
  it("detects the classic iOS user agents", () => {
    assert.equal(isIosDevice(IPHONE), true);
    assert.equal(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)"), true);
  });

  it("detects iPadOS 13+ masquerading as desktop Safari", () => {
    assert.equal(isIosDevice(IPADOS, 5), true);
  });

  it("does not mistake a real Mac for an iPad", () => {
    assert.equal(isIosDevice(IPADOS, 0), false);
    assert.equal(isIosDevice(MAC, 0), false);
  });

  it("leaves Android to the native install prompt", () => {
    assert.equal(isIosDevice(ANDROID), false);
  });
});

describe("isInstallHintSuppressed", () => {
  const now = 1_700_000_000_000;

  it("shows the hint when nothing was ever dismissed", () => {
    assert.equal(isInstallHintSuppressed(null, now), false);
  });

  it("hides the hint for the duration of the cooldown", () => {
    assert.equal(isInstallHintSuppressed(String(now - DAY_MS), now), true);
    assert.equal(isInstallHintSuppressed(String(now - (INSTALL_HINT_COOLDOWN_DAYS - 1) * DAY_MS), now), true);
  });

  it("offers again once the cooldown has elapsed", () => {
    assert.equal(isInstallHintSuppressed(String(now - (INSTALL_HINT_COOLDOWN_DAYS + 1) * DAY_MS), now), false);
  });

  it("ignores unparseable storage rather than hiding forever", () => {
    assert.equal(isInstallHintSuppressed("not-a-number", now), false);
    assert.equal(isInstallHintSuppressed("", now), false);
    assert.equal(isInstallHintSuppressed("0", now), false);
  });

  it("keeps the hint hidden when the clock moved backwards", () => {
    assert.equal(isInstallHintSuppressed(String(now + DAY_MS), now), true);
  });
});

describe("isMacSafari", () => {
  it("detects Safari on macOS, which installs via Add to Dock", () => {
    assert.equal(isMacSafari(MAC_SAFARI, 0), true);
  });

  it("excludes the Chromium and Firefox browsers that also claim Safari", () => {
    assert.equal(isMacSafari(MAC, 0), false);
    assert.equal(isMacSafari(MAC_EDGE, 0), false);
    assert.equal(isMacSafari(MAC_FIREFOX, 0), false);
  });

  it("leaves a touch iPad to the iOS instructions", () => {
    assert.equal(isMacSafari(MAC_SAFARI, 5), false);
  });

  it("ignores non-Mac platforms", () => {
    assert.equal(isMacSafari(IPHONE, 5), false);
    assert.equal(isMacSafari(ANDROID, 5), false);
  });
});

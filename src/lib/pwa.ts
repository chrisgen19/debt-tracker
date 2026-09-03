/** Shared helpers for the installable-app layer. Kept free of side effects so they are testable. */

export const INSTALL_DISMISSED_KEY = "owewell:install-dismissed";

/** How long a dismissed install hint stays hidden before it may be offered again. */
export const INSTALL_HINT_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * iOS has no `beforeinstallprompt`, so these devices get Add to Home Screen
 * instructions instead of a button. iPadOS 13+ reports a desktop Safari user
 * agent, and a touch-capable "Macintosh" is the only tell.
 */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Whether a stored dismissal timestamp should still suppress the install hint. */
export function isInstallHintSuppressed(
  stored: string | null,
  now: number = Date.now(),
  cooldownDays: number = INSTALL_HINT_COOLDOWN_DAYS,
): boolean {
  if (!stored) return false;
  const dismissedAt = Number(stored);
  if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
  const elapsed = now - dismissedAt;
  // A clock that moved backwards should not resurrect a dismissed hint.
  if (elapsed < 0) return true;
  return elapsed < cooldownDays * DAY_MS;
}

/**
 * Safari on macOS installs through File > Add to Dock and, like iOS, never fires
 * `beforeinstallprompt`. Chromium and Firefox both put "Safari" in their UA, so
 * they have to be excluded explicitly; touch points rule out an iPad.
 */
export function isMacSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!/Macintosh/.test(userAgent) || maxTouchPoints > 1) return false;
  if (!/Safari\//.test(userAgent)) return false;
  return !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent);
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Show the number of unsettled entries on the installed app icon. Supported by
 * Chromium on desktop and Android, and by iOS 16.4+ once installed; everywhere
 * else the call is simply absent. Rejections (no permission, not installed) are
 * not worth surfacing to the user.
 */
export function setAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNavigator;
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

/** Drop everything the installed app holds for the session that just ended. */
export function clearInstalledAppState(): void {
  if (typeof window === "undefined") return;
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  (navigator as BadgeNavigator).clearAppBadge?.().catch(() => {});
}

/** True when the page is running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Safari on iOS predates `display-mode` and still reports through this flag.
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  if (typeof window.matchMedia !== "function") return false;
  return ["standalone", "minimal-ui", "window-controls-overlay"].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

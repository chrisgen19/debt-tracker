"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { ArrowDownRight, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  INSTALL_DISMISSED_KEY,
  isInstallHintSuppressed,
  isIosDevice,
  isMacSafari,
  isStandalone,
} from "@/lib/pwa";

/** Chromium only. Fired in place of the browser's own install affordance once preventDefault'd. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Stashed by the capture script in the root layout, which runs before hydration. */
    __owewellInstallPrompt?: BeforeInstallPromptEvent;
  }
}

/** Which install route this browser actually offers. `null` means: say nothing. */
type Platform = "prompt" | "ios" | "mac-safari";

/** These snapshots read fixed properties of the browser, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

function readDismissal(): string | null {
  // Safari in private mode throws on localStorage rather than returning null.
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Already installed, or told us no recently. */
function isSuppressed(): boolean {
  return isStandalone() || isInstallHintSuppressed(readDismissal());
}

/**
 * Chromium fires `beforeinstallprompt` before React hydrates, so the capture
 * script in the root layout stashes it on `window`. This store lets React read
 * that stash and re-render whenever it changes, with no effect and no race.
 */
const promptListeners = new Set<() => void>();

function setStashedPrompt(event: BeforeInstallPromptEvent | undefined) {
  window.__owewellInstallPrompt = event;
  for (const listener of promptListeners) listener();
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  setStashedPrompt(event as BeforeInstallPromptEvent);
}

/** Installing from the browser's own menu retires the prompt without us. */
function onAppInstalled() {
  setStashedPrompt(undefined);
}

function subscribeInstallPrompt(onStoreChange: () => void) {
  if (promptListeners.size === 0) {
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
  }
  promptListeners.add(onStoreChange);
  return () => {
    promptListeners.delete(onStoreChange);
    if (promptListeners.size === 0) {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    }
  };
}

const getInstallPrompt = () => window.__owewellInstallPrompt ?? null;

/** The manual fallback for browsers that never fire `beforeinstallprompt`. */
function detectManualPlatform(): Platform | null {
  const { userAgent, maxTouchPoints } = navigator;
  if (isIosDevice(userAgent, maxTouchPoints)) return "ios";
  if (isMacSafari(userAgent, maxTouchPoints)) return "mac-safari";
  return null;
}

/**
 * Install entry point.
 *
 * Chromium hands us a real prompt. iOS and macOS Safari never fire
 * `beforeinstallprompt`, so they get the manual steps instead. Firefox on the
 * desktop has no install concept at all and correctly gets nothing.
 *
 * The two browser facts are read through `useSyncExternalStore` so the server
 * renders nothing and the client corrects itself after hydration, with no
 * mismatch and no setState inside an effect.
 */
export function InstallApp() {
  const suppressed = useSyncExternalStore(noSubscribe, isSuppressed, () => true);
  const detected = useSyncExternalStore(noSubscribe, detectManualPlatform, () => null);

  const promptEvent = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);

  const [dismissed, setDismissed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage denied: the hint simply returns on the next visit.
    }
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event is single-use whatever they chose. Clearing it drops this card,
    // because no other install route applies on a browser that offered a prompt.
    setStashedPrompt(undefined);
    if (outcome !== "accepted") dismiss();
  }

  const platform: Platform | null = promptEvent ? "prompt" : detected;
  if (suppressed || dismissed || !platform) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:left-auto md:max-w-sm md:pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pr-6">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ArrowDownRight className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">Install Owewell</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Keep the ledger one tap away, in its own window.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismiss}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {platform === "prompt" ? (
          <Button onClick={install} className="mt-4 w-full">
            Install app
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => setShowSteps((open) => !open)}
              aria-expanded={showSteps}
              className="mt-4 w-full"
            >
              {showSteps ? "Hide steps" : "Show me how"}
            </Button>
            {showSteps && (
              <ol className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {platform === "ios" ? (
                  <>
                    <li className="flex items-center gap-2">
                      <Share className="size-4 shrink-0 text-primary" aria-hidden />
                      1. Tap the Share button in the browser toolbar.
                    </li>
                    <li className="flex items-center gap-2">
                      <SquarePlus className="size-4 shrink-0 text-primary" aria-hidden />
                      2. Choose <strong className="font-semibold text-foreground">Add to Home Screen</strong>.
                    </li>
                    <li>3. Tap Add. Owewell opens full screen from then on.</li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center gap-2">
                      <Share className="size-4 shrink-0 text-primary" aria-hidden />
                      1. Open the Share menu, or the File menu, in Safari.
                    </li>
                    <li className="flex items-center gap-2">
                      <SquarePlus className="size-4 shrink-0 text-primary" aria-hidden />
                      2. Choose <strong className="font-semibold text-foreground">Add to Dock</strong>.
                    </li>
                  </>
                )}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

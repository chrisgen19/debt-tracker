"use client";

import { useOffline } from "next/offline";
import { CloudOff } from "lucide-react";

/**
 * Connectivity notice for the whole app.
 *
 * `useOffline` is more trustworthy than `navigator.onLine`, which reports true
 * for a device attached to a WiFi network that has no route to the internet. It
 * also covers the case this app actually cares about: with
 * `experimental.useOffline` on, a Server Action fired while offline stays
 * pending and replays on reconnect rather than failing, so the banner explains
 * why a save is sitting there.
 */
export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-40 bg-[#80621f] pt-[env(safe-area-inset-top)] text-white shadow-md"
    >
      <p className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold">
        <CloudOff className="size-4 shrink-0" aria-hidden />
        Offline. Anything you save will go through once you reconnect.
      </p>
    </div>
  );
}

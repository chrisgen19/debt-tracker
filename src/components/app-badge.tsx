"use client";

import { useEffect } from "react";
import { setAppBadge } from "@/lib/pwa";

/**
 * Mirrors the open-entry count onto the installed app icon, so an unsettled
 * ledger is visible without opening the app. Renders nothing, and does nothing
 * at all where the Badging API is missing.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    setAppBadge(count);
  }, [count]);

  return null;
}

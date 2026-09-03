"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Owns the service worker lifecycle.
 *
 * Updates are never applied behind the user's back: a new worker sits in
 * `waiting` until they accept the toast, so a background swap can never reload
 * the page out from under a half-filled entry form.
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the worker is not just skipped but actively removed. A single
    // earlier production build served on the same localhost origin would otherwise
    // keep answering with cached `/_next/static` chunks and silently break HMR.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        void caches
          .keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith("owewell-")).map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    let cancelled = false;
    let reloading = false;

    function onControllerChange() {
      // Fires once the accepted worker takes over. Guarded because Chrome can
      // dispatch it more than once and a second reload would loop.
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    function offerUpdate(worker: ServiceWorker) {
      if (cancelled) return;
      toast("A new version of Owewell is ready", {
        description: "Reload to pick up the latest changes.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    }

    let registration: ServiceWorkerRegistration | undefined;

    function onVisibilityChange() {
      // Installed apps can stay open for days; check for a new build on re-focus.
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;

        // An update that finished installing while the page was closed.
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // A null controller means this is the very first install, not an
            // update: there is nothing stale on screen, so say nothing.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              offerUpdate(installing);
            }
          });
        });

        document.addEventListener("visibilitychange", onVisibilityChange);
      })
      .catch(() => {
        // Registration is best-effort. A blocked or unsupported worker leaves the
        // app working exactly as it did before.
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

import type { Metadata } from "next";
import { ArrowDownRight, CloudOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  description: "Owewell could not reach the network.",
};

/**
 * The service worker's navigation fallback. It is public and static on purpose:
 * it has to render from the cache with no session, no database and no network,
 * and it must never be able to leak a household's ledger. Retry is a plain link
 * so the page still works with no JavaScript hydrated.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex items-center justify-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ArrowDownRight className="size-5" aria-hidden />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Owewell</span>
        </div>

        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
          <CloudOff className="size-7" aria-hidden />
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-tight">You are offline</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Your ledger lives on the server, so it needs a connection to load. Nothing has been lost:
          reconnect and everything will be exactly where you left it.
        </p>

        <a
          href="/dashboard"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[.98]"
        >
          Try again
        </a>
      </div>
    </main>
  );
}

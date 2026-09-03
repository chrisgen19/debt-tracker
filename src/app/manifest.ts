import type { MetadataRoute } from "next";

/**
 * Web App Manifest. `id` is fixed and independent of `start_url` so the install
 * identity survives any later change to the launch route.
 *
 * `theme_color` matches the page background rather than the brand green: the
 * sticky header is `bg-background`, so the Android status bar and the desktop
 * title bar blend into it instead of drawing a band above it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Owewell — Shared debt tracker",
    short_name: "Owewell",
    description: "A private, two-person ledger for everyday cash and card borrowing.",
    // The dashboard redirects to /login when there is no session, so a signed-out
    // launch still lands somewhere sensible without an extra redirect hop.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f7f2",
    theme_color: "#f7f7f2",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Add an entry",
        short_name: "Add entry",
        description: "Record a new borrowed item",
        url: "/dashboard?new=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Open balances",
        short_name: "Balances",
        description: "Every unsettled entry in the household",
        url: "/dashboard?ledger=open",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

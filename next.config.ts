import type { NextConfig } from "next";

/**
 * Long-lived, no-cookie assets. `/_next/static` is content-hashed by the build,
 * and the icons only change when the version in `sw.js` is bumped.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  experimental: {
    // Keeps a navigation or Server Action fired during a connectivity drop pending
    // and replays it on reconnect, instead of throwing. For a ledger, a saved entry
    // surviving a lift ride matters more than a fast failure. Also backs the
    // `useOffline` hook that drives the offline banner.
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The worker script itself must never be served stale, or a bad deploy
        // becomes permanent for anyone who already has it.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    ];
  },
};

export default nextConfig;

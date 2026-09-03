/**
 * Owewell service worker.
 *
 * Design constraint: every route in this app except `/login` and `/offline` is
 * authenticated and rendered per request, so document and RSC responses carry one
 * household's private ledger. Nothing of the sort is ever written to a cache.
 * What the caches hold is limited to build output and the public offline shell.
 *
 * Registered only in production, from service-worker-manager.tsx.
 */

// Bump to retire every previous cache on the next activation.
const VERSION = "v1";
const SHELL_CACHE = `owewell-shell-${VERSION}`;
const STATIC_CACHE = `owewell-static-${VERSION}`;
const OWNED = [SHELL_CACHE, STATIC_CACHE];

const OFFLINE_URL = "/offline";

/** Public, session-independent assets. Small enough to fetch up front. */
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // `reload` bypasses the HTTP cache so a fresh install never adopts a stale shell.
      // Individual failures must not abort the install, so each asset is added on its own.
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      ),
    ),
  );
  // No skipWaiting() here on purpose: the page decides when to activate an update,
  // so a reload never swaps the assets out from under a half-submitted form.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("owewell-") && !OWNED.includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  // Sent on sign-out. By design no cache holds anything private, but dropping the
  // app code costs one refetch and removes all doubt.
  //
  // The shell cache deliberately survives: it holds only the public offline page,
  // the manifest and the icons. Deleting it would strand the offline fallback,
  // because this worker stays activated and its install handler never runs again,
  // so nothing would repopulate /offline until a new version deployed.
  if (type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("owewell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
    );
  }
});

/** Content-hashed build output: the URL changes whenever the bytes do. */
function isImmutable(url) {
  return url.pathname.startsWith("/_next/static/");
}

/** Public branding assets, safe to cache and worth revalidating in the background. */
function isPublicAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    /^\/(apple-)?icon[\w.-]*$/.test(url.pathname)
  );
}

/**
 * An RSC payload is the same private data as the document, just serialized.
 * Next.js marks these with the `RSC` header, and prefetches with `?_rsc=`.
 */
function isRscRequest(request, url) {
  return request.headers.has("RSC") || url.searchParams.has("_rsc");
}

/**
 * Refuse anything that is per-user or that the origin told us not to store.
 * A `Vary: Cookie` response cannot be replayed safely to a different session.
 */
function isStorable(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  if (response.headers.has("Set-Cookie")) return false;
  const control = response.headers.get("Cache-Control") ?? "";
  if (/\b(private|no-store)\b/i.test(control)) return false;
  const vary = response.headers.get("Vary") ?? "";
  if (/\b(cookie|authorization)\b/i.test(vary)) return false;
  return true;
}

/**
 * Cache writes are handed to `event.waitUntil` so the browser keeps the worker
 * alive until they land. Without it a write started as the response is returned
 * can be cut short when the worker is terminated, and the entry is silently lost.
 */
async function cacheFirst(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (isStorable(response)) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (isStorable(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (hit) {
    // Serve the hit now; the refresh has to outlive this response.
    event.waitUntil(network);
    return hit;
  }

  const response = await network;
  if (response) return response;
  throw new Error(`Unavailable offline: ${request.url}`);
}

/**
 * Documents are network-only. The response is never stored; on failure the user
 * gets the offline shell instead of the browser's dinosaur.
 */
async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const fallback = await cache.match(OFFLINE_URL);
    if (fallback) return fallback;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Server Actions and auth are POSTs; leave every mutation strictly alone.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only this origin. Anything third-party keeps its default behaviour.
  if (url.origin !== self.location.origin) return;

  // Auth and API traffic is never cached, never intercepted.
  if (url.pathname.startsWith("/api/")) return;

  // Private data in serialized form.
  if (isRscRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE));
    return;
  }

  if (isPublicAsset(url)) {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    return;
  }

  // Everything else falls through to the network untouched.
});

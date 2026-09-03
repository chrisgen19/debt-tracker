import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createContext, runInContext } from "node:vm";

/**
 * Loads `public/sw.js` into a VM with stubbed service worker globals so the
 * routing decisions can be asserted directly. The point of these tests is the
 * security boundary: every route but /login and /offline is authenticated, so a
 * document, an RSC payload or an API response must never reach a cache.
 */

const ORIGIN = "https://owewell.example";
const SOURCE = readFileSync("public/sw.js", "utf8");

/** Duck-typed because the Fetch spec forbids constructing a Request with mode "navigate". */
type SwRequest = { url: string; method: string; mode: string; headers: Headers };

type SwEvent = {
  request: SwRequest;
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};
type ExtendableEvent = { waitUntil: (work: Promise<unknown>) => void; data?: { type: string } };

function request(path: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}): SwRequest {
  return {
    url: new URL(path, ORIGIN).href,
    method: init.method ?? "GET",
    mode: init.mode ?? "no-cors",
    headers: new Headers(init.headers),
  };
}

class MockCache {
  readonly entries = new Map<string, Response>();

  private key(target: SwRequest | string) {
    return typeof target === "string" ? new URL(target, ORIGIN).href : target.url;
  }

  constructor(private readonly fetcher: () => (target: SwRequest) => Promise<Response>) {}

  async match(target: SwRequest | string) {
    return this.entries.get(this.key(target));
  }

  /** When set, writes only land once the returned promise is awaited. */
  static delayWrites = false;

  async put(target: SwRequest | string, response: Response) {
    if (MockCache.delayWrites) await new Promise((resolve) => setTimeout(resolve, 0));
    this.entries.set(this.key(target), response);
  }

  async add(target: SwRequest) {
    const response = await this.fetcher()(target);
    if (!response.ok) throw new Error(`add failed: ${target.url}`);
    this.entries.set(this.key(target), response);
  }
}

function createHarness() {
  const listeners = new Map<string, (event: never) => void>();
  const cacheStorage = new Map<string, MockCache>();
  const fetched: string[] = [];
  /** Work the worker asked the browser to keep it alive for. */
  const extended: Promise<unknown>[] = [];

  let fetcher: (target: SwRequest) => Promise<Response> = async () => new Response("ok");
  const currentFetcher = () => fetcher;

  const caches = {
    async open(name: string) {
      let cache = cacheStorage.get(name);
      if (!cache) {
        cache = new MockCache(currentFetcher);
        cacheStorage.set(name, cache);
      }
      return cache;
    },
    async keys() {
      return [...cacheStorage.keys()];
    },
    async delete(name: string) {
      return cacheStorage.delete(name);
    },
  };

  let skipWaitingCalls = 0;
  const sandbox = {
    self: {
      addEventListener: (type: string, handler: (event: never) => void) => listeners.set(type, handler),
      location: new URL(ORIGIN),
      skipWaiting: () => {
        skipWaitingCalls += 1;
      },
      clients: { claim: async () => {} },
    },
    caches,
    fetch: (target: SwRequest) => {
      fetched.push(target.url);
      return fetcher(target);
    },
    Request: class {
      url: string;
      method = "GET";
      mode = "no-cors";
      headers = new Headers();
      // The worker calls this with a second init argument; the stub ignores it.
      constructor(input: string) {
        this.url = new URL(input, ORIGIN).href;
      }
    },
    Response,
    Headers,
    URL,
  };

  runInContext(SOURCE, createContext(sandbox));

  return {
    cacheStorage,
    fetched,
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
    setFetch(next: (target: SwRequest) => Promise<Response>) {
      fetcher = next;
    },
    async install() {
      const pending: Promise<unknown>[] = [];
      (listeners.get("install") as (event: ExtendableEvent) => void)({
        waitUntil: (work) => pending.push(work),
      });
      await Promise.all(pending);
    },
    async activate() {
      const pending: Promise<unknown>[] = [];
      (listeners.get("activate") as (event: ExtendableEvent) => void)({
        waitUntil: (work) => pending.push(work),
      });
      await Promise.all(pending);
    },
    async message(type: string) {
      const pending: Promise<unknown>[] = [];
      (listeners.get("message") as (event: ExtendableEvent) => void)({
        data: { type },
        waitUntil: (work) => pending.push(work),
      });
      await Promise.all(pending);
    },
    /** Number of pending `waitUntil` extensions not yet settled. */
    extensionCount() {
      return extended.length;
    },
    /** Await everything the worker passed to `waitUntil`. */
    async settle() {
      await Promise.all(extended.splice(0));
    },
    /** Returns the response the worker took over with, or null when it passed the request through. */
    handle(target: SwRequest): Promise<Response> | null {
      let taken: Promise<Response> | null = null;
      (listeners.get("fetch") as (event: SwEvent) => void)({
        request: target,
        respondWith: (response) => {
          taken = response;
        },
        waitUntil: (work) => {
          extended.push(work);
        },
      });
      return taken;
    },
  };
}

/** Everything cached by the worker, across every cache it owns. */
function cachedUrls(harness: ReturnType<typeof createHarness>) {
  return [...harness.cacheStorage.values()].flatMap((cache) => [...cache.entries.keys()]);
}

describe("service worker request routing", () => {
  it("never intercepts mutations, so Server Actions are untouched", () => {
    const sw = createHarness();
    assert.equal(sw.handle(request("/dashboard", { method: "POST" })), null);
  });

  it("never intercepts API or auth traffic", () => {
    const sw = createHarness();
    assert.equal(sw.handle(request("/api/auth/get-session")), null);
    assert.equal(sw.handle(request("/api/health")), null);
  });

  it("never intercepts RSC payloads, which carry the same private data as the page", () => {
    const sw = createHarness();
    assert.equal(sw.handle(request("/dashboard", { headers: { RSC: "1" } })), null);
    assert.equal(sw.handle(request("/dashboard?_rsc=abc123")), null);
  });

  it("leaves cross-origin requests alone", () => {
    const sw = createHarness();
    assert.equal(sw.handle(request("https://fonts.example/font.woff2")), null);
  });

  it("serves documents from the network without ever caching them", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("<html>private ledger</html>"));
    const response = await sw.handle(request("/dashboard", { mode: "navigate" }))!;

    assert.equal(await response.text(), "<html>private ledger</html>");
    assert.deepEqual(cachedUrls(sw), []);
  });

  it("falls back to the precached offline page when a document cannot be fetched", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("offline shell", { status: 200 }));
    await sw.install();

    sw.setFetch(async () => {
      throw new TypeError("network error");
    });
    const response = await sw.handle(request("/dashboard", { mode: "navigate" }))!;

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "offline shell");
  });

  it("still answers a failed document request when the shell was never cached", async () => {
    const sw = createHarness();
    sw.setFetch(async () => {
      throw new TypeError("network error");
    });
    const response = await sw.handle(request("/dashboard", { mode: "navigate" }))!;
    assert.equal(response.status, 503);
  });
});

describe("service worker caching", () => {
  it("serves content-hashed build output from the cache after the first hit", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("chunk", { headers: { "Cache-Control": "public, max-age=31536000, immutable" } }));

    const asset = request("/_next/static/chunks/main-abc123.js");
    await sw.handle(asset)!;
    await sw.settle();
    assert.equal(sw.fetched.length, 1);

    const second = await sw.handle(asset)!;
    assert.equal(await second.text(), "chunk");
    assert.equal(sw.fetched.length, 1, "second read should not reach the network");
  });

  it("refuses to store a response carrying a session cookie", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("chunk", { headers: { "Set-Cookie": "session=secret" } }));

    await sw.handle(request("/_next/static/chunks/main-abc123.js"))!;
    await sw.settle();
    assert.deepEqual(cachedUrls(sw), []);
  });

  it("refuses to store a response marked private or varying on cookie", async () => {
    const sw = createHarness();

    sw.setFetch(async () => new Response("x", { headers: { "Cache-Control": "private, max-age=0" } }));
    await sw.handle(request("/_next/static/chunks/a.js"))!;

    sw.setFetch(async () => new Response("x", { headers: { Vary: "Cookie" } }));
    await sw.handle(request("/_next/static/chunks/b.js"))!;

    sw.setFetch(async () => new Response("x", { status: 404 }));
    await sw.handle(request("/_next/static/chunks/c.js"))!;

    await sw.settle();
    assert.deepEqual(cachedUrls(sw), []);
  });

  it("keeps the worker alive until a slow cache-first write lands", async () => {
    MockCache.delayWrites = true;
    try {
      const sw = createHarness();
      sw.setFetch(async () => new Response("chunk"));

      await sw.handle(request("/_next/static/chunks/main-abc123.js"))!;
      // The write is still in flight, and the worker asked to stay alive for it.
      assert.deepEqual(cachedUrls(sw), []);
      assert.equal(sw.extensionCount(), 1);

      await sw.settle();
      assert.equal(cachedUrls(sw).length, 1);
    } finally {
      MockCache.delayWrites = false;
    }
  });

  it("keeps the worker alive for a background revalidation it did not wait on", async () => {
    MockCache.delayWrites = true;
    try {
      const sw = createHarness();
      sw.setFetch(async () => new Response("v1"));
      const icon = request("/icons/icon-192.png");

      await sw.handle(icon)!;
      await sw.settle();

      sw.setFetch(async () => new Response("v2"));
      // The stale hit returns first, so the refresh has to be an extension.
      assert.equal(await (await sw.handle(icon)!).text(), "v1");
      assert.equal(sw.extensionCount(), 1);

      await sw.settle();
      assert.equal(await (await sw.handle(icon)!).text(), "v2");
    } finally {
      MockCache.delayWrites = false;
    }
  });

  it("revalidates public branding assets in the background", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("v1"));
    const icon = request("/icons/icon-192.png");

    assert.equal(await (await sw.handle(icon)!).text(), "v1");
    await sw.settle();

    sw.setFetch(async () => new Response("v2"));
    // A cache hit is served immediately; the refreshed copy lands for next time.
    assert.equal(await (await sw.handle(icon)!).text(), "v1");
    await sw.settle();
    assert.equal(await (await sw.handle(icon)!).text(), "v2");
  });
});

describe("service worker lifecycle", () => {
  it("precaches only the public offline shell", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("asset"));
    await sw.install();

    const cached = cachedUrls(sw).map((url) => new URL(url).pathname).sort();
    assert.deepEqual(cached, [
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
      "/manifest.webmanifest",
      "/offline",
    ]);
  });

  it("installs even when a shell asset cannot be fetched", async () => {
    const sw = createHarness();
    sw.setFetch(async (target) =>
      target.url.endsWith("/offline") ? new Response("shell") : new Response("gone", { status: 404 }),
    );
    await sw.install();

    assert.deepEqual(cachedUrls(sw).map((url) => new URL(url).pathname), ["/offline"]);
  });

  it("does not activate an update until the page asks", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("asset"));
    await sw.install();
    assert.equal(sw.skipWaitingCalls, 0);

    await sw.message("SKIP_WAITING");
    assert.equal(sw.skipWaitingCalls, 1);
  });

  it("retires caches from previous versions on activation", async () => {
    const sw = createHarness();
    const stub = () => new MockCache(() => async () => new Response(""));
    sw.cacheStorage.set("owewell-static-v0", stub());
    sw.cacheStorage.set("owewell-shell-v0", stub());
    // A cache this worker does not own must survive.
    sw.cacheStorage.set("unrelated-cache", stub());

    await sw.activate();

    assert.deepEqual([...sw.cacheStorage.keys()], ["unrelated-cache"]);
  });

  it("drops cached app code on sign-out but keeps the public offline shell", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("asset"));
    await sw.install();
    await sw.handle(request("/_next/static/chunks/main-abc123.js"))!;
    await sw.settle();

    await sw.message("CLEAR_CACHES");

    // The shell is public by construction, and this worker's install handler will
    // not run again, so dropping it would strand the offline fallback for good.
    assert.deepEqual([...sw.cacheStorage.keys()], ["owewell-shell-v1"]);
  });

  it("still serves the offline page after a sign-out", async () => {
    const sw = createHarness();
    sw.setFetch(async () => new Response("offline shell"));
    await sw.install();
    await sw.message("CLEAR_CACHES");

    sw.setFetch(async () => {
      throw new TypeError("network error");
    });
    const response = await sw.handle(request("/dashboard", { mode: "navigate" }))!;

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "offline shell");
  });
});

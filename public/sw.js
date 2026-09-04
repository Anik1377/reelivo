/* Reelivo offline shell — production service worker.
 *
 * Strategies:
 *  - navigations          → network first, fall back to the cached SPA shell ("/")
 *  - /_next/static assets → cache first (content-hashed, immutable)
 *  - image.tmdb.org       → cache first (artwork is effectively immutable per size)
 *  - /api/tmdb/*          → network first, cached copy serves when offline
 *
 * The worker is registered only in production (see app.tsx) so dev HMR is untouched.
 */

/* v3: purges any cached SPA shell from the pre-https-canonical era (v2 shells
 * could hold old HTML whose OG tags resolved against http://). */
const VERSION = "reelivo-v3";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  /* navigations → network first, cached SPA shell offline */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  /* hashed static assets → cache first */
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  /* TMDB artwork → cache first */
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  /* TMDB proxy data → network first, cache fallback */
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/tmdb/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
});

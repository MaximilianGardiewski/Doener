const CACHE = "mcello-public-shell-v6";
const APP_SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/public-content.js",
  "/motion.js",
  "/motion.css",
  "/manifest.webmanifest",
  "/media/placeholder.svg",
  "/icons/pwa-192.png",
  "/icons/pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Checkout/status/business data must never be satisfied from a stale cache.
  // If the backend is unreachable these requests fail and the UI remains read-only.
  if (url.pathname.startsWith("/api/")
      || url.pathname.startsWith("/rest/")
      || url.pathname.startsWith("/auth/")
      || url.pathname.startsWith("/storage/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});

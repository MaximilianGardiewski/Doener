const CACHE = "mcello-public-shell-v32";
const APP_SHELL = [
  "/", "/styles.css", "/brand-system.css", "/homepage-v2.css", "/public-theke.css", "/app.js",
  "/public-content.js", "/presentation-mode.js", "/presentation-mode.css", "/public-copy.js", "/placeholder-media.js", "/homepage-composition.js",
  "/motion.js", "/motion.css", "/motion/engine.js", "/motion/accessibility.js", "/motion/homepage.js", "/motion/commerce.js", "/store-v2.js", "/store-v2.css",
  "/builder-core-v2.js", "/builder-core-v2.css", "/commerce-theke.js", "/commerce-theke.css", "/public-theke.js", "/pizza-builder-v2.js", "/pizza-builder-v2.css",
  "/doner-yufka-builder-v2.js", "/doner-yufka-builder-v2.css",
  "/vendor/gsap/gsap.min.js", "/vendor/gsap/ScrollTrigger.min.js", "/vendor/gsap/Flip.min.js",
  "/operations-shell.js", "/operations-shell.css", "/operations-theke.css",
  "/handbook.html", "/handbook.js", "/handbook.css", "/handbook/shared.md", "/handbook/staff.md", "/handbook/admin.md",
  "/manifest.webmanifest", "/media/placeholder.svg", "/icons/pwa-192.png", "/icons/pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))]));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/storage/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      if (url.pathname === "/handbook.html") return (await caches.match("/handbook.html")) || Response.error();
      return (await caches.match("/")) || Response.error();
    }));
    return;
  }
  if (APP_SHELL.includes(url.pathname)) event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
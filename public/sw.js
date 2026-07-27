const CACHE = "pixel-everywhere-alpha-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/web/styles.css",
  "/web/main.js",
  "/manifest.webmanifest",
  "/assets/pdd-logo.jpg",
  "/assets/pdd2-wordmark.png",
  "/assets/alpha-logo.png",
  "/assets/pixel-mascot.png",
  "/assets/pixel-body.png",
  "/assets/pixel-eye.png",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
    )
  );
});

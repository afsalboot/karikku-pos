const CACHE = "karikku-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const cacheable = request.method === "GET" && url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || ["style", "script", "font", "image"].includes(request.destination));
  if (!cacheable) return;
  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }));
});

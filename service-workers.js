const CACHE_NAME = "acc-shell-v6.8";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",

  "./css/01-base.css",
  "./css/02-layout.css",
  "./css/03-components.css",
  "./css/04-modals.css",
  "./css/05-forms.css",
  "./css/06-sections.css",
  "./css/07-effects.css",
  "./css/08-responsive.css",
  "./css/09-theme.css",

  "./js/01-config.js",
  "./js/02-storage.js",
  "./js/03-utils.js",
  "./js/04-render.js",
  "./js/05-forms.js",
  "./js/06-actions.js",
  "./js/07-events.js",
  "./js/08-modals.js",
  "./js/09-export.js",
  "./js/10-init.js",

  "./icons/icon-152.png",
  "./icons/icon-167.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigationRequest =
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html");

  if (isNavigationRequest) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(event.request)) ||
            (await caches.match("./")) ||
            (await caches.match("./index.html"))
          );
        })
    );
    return;
  }

  event.respondWith(
  caches.match(event.request).then(cached => {
    if (cached) {
      fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return;
          }

          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        })
        .catch(() => {});

      return cached;
    }

    return fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type !== "basic") {
        return response;
      }

      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    });
  })
);
});

const CACHE_NAME = "acc-shell-v7.5";
const RUNTIME_CACHE = "acc-runtime-v7.5";

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

  "./icons/favicon.ico",
  "./icons/favicon-32x32.png",
  "./icons/icon-167x167.png",
  "./icons/icon-180x180.png",
  "./icons/icon-192x192.png",
  "./icons/icon-192x192-maskable.png",
  "./icons/icon-512x512.png",
  "./icons/icon-512x512-maskable.png",
  "./icons/icon-1024x1024.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", event => {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
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
      (async () => {
        try {
          const fresh = await fetch(event.request);

          if (fresh && fresh.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, fresh.clone());
          }

          return fresh;
        } catch (error) {
          return (
            (await caches.match(event.request)) ||
            (await caches.match("./")) ||
            (await caches.match("./index.html"))
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) {
        fetch(event.request)
          .then(async response => {
            if (!response || response.status !== 200 || response.type !== "basic") {
              return;
            }

            const runtime = await caches.open(RUNTIME_CACHE);
            runtime.put(event.request, response.clone());
          })
          .catch(() => {});

        return cached;
      }

      try {
        const response = await fetch(event.request);

        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const runtime = await caches.open(RUNTIME_CACHE);
        runtime.put(event.request, response.clone());

        return response;
      } catch (error) {
        return caches.match(event.request);
      }
    })()
  );
});

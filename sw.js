const CACHE = "field-defect-app-v9";
const ASSETS = ["./", "./index.html", "./styles.css?v=9", "./app.js?v=9", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

const CACHE = "field-defect-app-v10";
const ASSETS = ["./", "./index.html", "./styles.css?v=10", "./app.js?v=10", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

const CACHE = "field-defect-app-v11";
const ASSETS = ["./", "./index.html", "./styles.css?v=11", "./app.js?v=11", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

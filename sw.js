const CACHE = "field-defect-app-v12";
const ASSETS = ["./", "./index.html", "./styles.css?v=12", "./app.js?v=12", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

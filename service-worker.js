/* ============================================================
   service-worker.js — offline operation (PWA)
   Caches the app and data so the test works without a network.
   Bump CACHE_VERSION after changing files so the cache refreshes.
   ============================================================ */
var CACHE_VERSION = "ra-kviz-v1";

var ASSETS = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "css/base.css",
  "css/screens.css",
  "js/config.js",
  "js/storage.js",
  "js/api.js",
  "js/quiz.js",
  "js/ui.js",
  "js/app.js",
  "data/questions.json",
  "data/results.json",
  "assets/logo.svg",
  "assets/background.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k !== CACHE_VERSION;
          })
          .map(function (k) {
            return caches.delete(k);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return; // never cache POSTs to the API

  var url = new URL(req.url);
  // Requests to a different origin (e.g. the API) are left alone – straight to the network.
  if (url.origin !== self.location.origin) return;

  // App shell + data: cache-first, silently falling back to cache on failure.
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match("index.html");
        });
    })
  );
});

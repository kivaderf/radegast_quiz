/* ============================================================
   service-worker.js — offline běh (PWA)
   Cachuje aplikaci i data, aby test fungoval bez sítě.
   Po úpravě souborů zvyš CACHE_VERSION, ať se cache obnoví.
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
  if (req.method !== "GET") return; // POST na API nikdy necachujeme

  var url = new URL(req.url);
  // Požadavky mimo náš původ (např. API) neřešíme – jdou přímo na síť.
  if (url.origin !== self.location.origin) return;

  // App shell + data: cache-first, s tichým doplněním z cache při výpadku.
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

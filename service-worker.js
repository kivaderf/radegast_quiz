/* ============================================================
   service-worker.js — offline operation (PWA)
   Every image is precached up front, the first time the app runs
   (install event) — not lazily on first use. HTML/CSS/JS/JSON always
   go straight to the network, so their changes show up on a normal
   reload without bumping a version or clearing anything by hand.

   Added a new image? Add its path to IMAGES below and bump
   IMAGE_CACHE so devices pick up the new precache list.
   ============================================================ */
var IMAGE_CACHE = "ra-kviz-images-v1";

var IMAGES = [
  "assets/background_start.jpg",
  "assets/background_rest.jpg",
  "assets/screen_saver.jpg",
  "assets/Radegast_logo.png",
  "assets/colours2026_logo_datum.png",
  "assets/prijato.png",
  "assets/R_logo_192.png",
  "assets/R_logo_512.png",
  "assets/trait_strength.png",
  "assets/trait_decisiveness.png",
  "assets/trait_resilience.png",
  "assets/trait_responsibility.png",
  "assets/favicon_io/favicon.ico",
  "assets/favicon_io/favicon-16x16.png",
  "assets/favicon_io/favicon-32x32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(IMAGE_CACHE).then(function (cache) {
      return cache.addAll(IMAGES);
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
            return k !== IMAGE_CACHE;
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
  // Requests to a different origin (e.g. the API) are left alone.
  if (url.origin !== self.location.origin) return;
  // Only images are cached - everything else always hits the network.
  if (!/\.(png|jpe?g|svg|webp|gif|ico)$/i.test(url.pathname)) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      // Not in the precache (e.g. added after install) - fetch once and
      // cache it so it's available offline from then on.
      return fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(IMAGE_CACHE).then(function (cache) {
          cache.put(req, copy);
        });
        return res;
      });
    })
  );
});

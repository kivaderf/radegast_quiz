/* ============================================================
   api.js — server communication + offline queue
   Both endpoints are GET with query params, not POST/JSON. Results
   accumulate locally and are sent automatically once the API is
   reachable. One ID (hash) = one record (no duplicates).
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var Store = window.Store;

  // Our trait key -> the API's "kviz" value (its title word, upper-case, no diacritics).
  var KVIZ_PARAM = {
    strength: "SILNY",
    decisiveness: "ROZHODNY",
    resilience: "ODOLNY",
    responsibility: "ZODPOVEDNY"
  };

  // fetch with a timeout – give up after API_TIMEOUT_MS
  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () {
        ctrl.abort();
        reject(new Error("timeout"));
      }, Cfg.API_TIMEOUT_MS);
      opts.signal = ctrl.signal;
      fetch(url, opts).then(
        function (res) {
          clearTimeout(timer);
          resolve(res);
        },
        function (err) {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  // Both endpoints are plain GET with no body, so this only matters
  // once an auth header gets added to Cfg.API_HEADERS.
  function headers() {
    return Cfg.API_HEADERS || {};
  }

  var Api = {
    /* Checks the ID before the test.
       Returns { allowed: bool, reason: string }
         - reason "not-found": the hash doesn't exist at all -> denied
         - reason "already": the ID already completed the test -> denied
       Rules:
         1) If the ID is locally marked as completed -> deny (even offline).
         2) If the API is configured, ask the server:
              { exists: false }                -> not-found, deny
              { exists: true, kviz: null }      -> ok, allow
              { exists: true, kviz: "<TRAIT>" } -> already, deny
         3) If the API is missing or unavailable -> ALLOW (fail-open). */
    checkId: function (id) {
      if (Store.isCompleted(id)) {
        klog("[Kvíz:API] ID už je lokálně označené jako dokončené:", id);
        return Promise.resolve({ allowed: false, reason: "already" });
      }
      if (!Cfg.API_BASE) {
        klog("[Kvíz:API] Žádné API nastavené, propouštím (fail-open).");
        return Promise.resolve({ allowed: true, reason: "no-api" });
      }
      var url = Cfg.API_BASE + Cfg.ENDPOINTS.check + "?hash=" + encodeURIComponent(id);
      return fetchWithTimeout(url, { method: "GET", headers: headers() })
        .then(function (res) {
          if (!res.ok) {
            klog("[Kvíz:API] Chyba API při kontrole ID, propouštím:", res.status);
            return { allowed: true, reason: "api-error" };
          }
          return res.json().then(function (data) {
            klog("[Kvíz:API] Odpověď serveru na kontrolu ID:", id, data);
            if (!data || !data.exists) {
              return { allowed: false, reason: "not-found" };
            }
            if (data.kviz) {
              return { allowed: false, reason: "already" };
            }
            return { allowed: true, reason: "ok" };
          });
        })
        .catch(function (err) {
          // API unavailable -> let them through (per spec)
          klog("[Kvíz:API] API nedostupné, propouštím (fail-open):", err);
          return { allowed: true, reason: "offline" };
        });
    },

    /* Saves the result: locally first (deduped by ID), then tries to send it. */
    saveResult: function (record) {
      Store.markCompleted(record.id);
      var wasNew = Store.enqueue(record);
      klog(
        "[Kvíz:API] Výsledek uložen lokálně" +
          (wasNew ? " a zařazen do fronty:" : " (ID už bylo ve frontě):"),
        record
      );
      return Api.flushQueue();
    },

    /* Tries to send everything in the queue. Without an API or offline it just quietly stops. */
    flushQueue: function () {
      var queue = Store.getQueue();
      if (!Cfg.API_BASE || !navigator.onLine || queue.length === 0) {
        klog(
          "[Kvíz:API] Fronta se neodesílá (API: " + !!Cfg.API_BASE +
            ", online: " + navigator.onLine +
            ", ve frontě: " + queue.length + ")."
        );
        return Promise.resolve({ sent: 0, pending: queue.length });
      }
      klog("[Kvíz:API] Odesílám frontu, položek:", queue.length);
      var sent = 0;
      // send one at a time so we don't flood the server
      return queue
        .reduce(function (chain, rec) {
          return chain.then(function () {
            var kviz = KVIZ_PARAM[rec.type];
            if (!kviz) {
              klog("[Kvíz:API] Neznámý typ výsledku, přeskočeno:", rec.id, rec.type);
              return;
            }
            var url =
              Cfg.API_BASE + Cfg.ENDPOINTS.result +
              "?hash=" + encodeURIComponent(rec.id) +
              "&kviz=" + encodeURIComponent(kviz);
            return fetchWithTimeout(url, { method: "GET", headers: headers() })
              .then(function (res) {
                if (!res.ok) {
                  klog("[Kvíz:API] Odeslání selhalo, necháno ve frontě:", rec.id, res.status);
                  return;
                }
                return res.json().then(function (data) {
                  if (data && data.success) {
                    Store.removeFromQueue(rec.id);
                    sent++;
                    klog("[Kvíz:API] Odesláno:", rec.id, data);
                  } else {
                    klog("[Kvíz:API] Odeslání selhalo (success:false), necháno ve frontě:", rec.id, data);
                  }
                });
              })
              .catch(function (err) {
                /* leave it queued for next time */
                klog("[Kvíz:API] Odeslání selhalo (síť), necháno ve frontě:", rec.id, err);
              });
          });
        }, Promise.resolve())
        .then(function () {
          var result = { sent: sent, pending: Store.queueSize() };
          klog("[Kvíz:API] Frontu odesláno:", result);
          return result;
        });
    }
  };

  // Try flushing the queue whenever the network comes back.
  window.addEventListener("online", function () {
    Api.flushQueue();
  });

  window.Api = Api;
})();

/* ============================================================
   api.js — server communication + offline queue
   V1: API_BASE is null, so nothing is sent. Results accumulate
   locally and are sent automatically once you set the API and
   it becomes available. One ID = one record (no duplicates).
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var Store = window.Store;

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

  function headers() {
    var h = { "Content-Type": "application/json" };
    var extra = Cfg.API_HEADERS || {};
    for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  var Api = {
    /* Checks the ID before the test.
       Returns { allowed: bool, reason: string }
         - reason "already": the ID already completed the test -> denied
       Rules:
         1) If the ID is locally marked as completed -> deny (even offline).
         2) If the API is configured, ask the server (exists=true -> deny).
         3) If the API is missing or unavailable -> ALLOW (fail-open). */
    checkId: function (id) {
      if (Store.isCompleted(id)) {
        return Promise.resolve({ allowed: false, reason: "already" });
      }
      if (!Cfg.API_BASE) {
        return Promise.resolve({ allowed: true, reason: "no-api" });
      }
      return fetchWithTimeout(Cfg.API_BASE + Cfg.ENDPOINTS.check, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ id: id })
      })
        .then(function (res) {
          if (!res.ok) return { allowed: true, reason: "api-error" };
          return res.json().then(function (data) {
            return data && data.exists
              ? { allowed: false, reason: "already" }
              : { allowed: true, reason: "ok" };
          });
        })
        .catch(function () {
          // API unavailable -> let them through (per spec)
          return { allowed: true, reason: "offline" };
        });
    },

    /* Saves the result: locally first (deduped by ID), then tries to send it. */
    saveResult: function (record) {
      Store.markCompleted(record.id);
      Store.enqueue(record);
      return Api.flushQueue();
    },

    /* Tries to send everything in the queue. Without an API or offline it just quietly stops. */
    flushQueue: function () {
      var queue = Store.getQueue();
      if (!Cfg.API_BASE || !navigator.onLine || queue.length === 0) {
        return Promise.resolve({ sent: 0, pending: queue.length });
      }
      var sent = 0;
      // send one at a time so we don't flood the server
      return queue
        .reduce(function (chain, rec) {
          return chain.then(function () {
            return fetchWithTimeout(Cfg.API_BASE + Cfg.ENDPOINTS.result, {
              method: "POST",
              headers: headers(),
              body: JSON.stringify(rec)
            })
              .then(function (res) {
                // 200/201 = saved; 409 = server already has the record -> also OK
                if (res.ok || res.status === 409) {
                  Store.removeFromQueue(rec.id);
                  sent++;
                }
              })
              .catch(function () {
                /* leave it queued for next time */
              });
          });
        }, Promise.resolve())
        .then(function () {
          return { sent: sent, pending: Store.queueSize() };
        });
    }
  };

  // Try flushing the queue whenever the network comes back.
  window.addEventListener("online", function () {
    Api.flushQueue();
  });

  window.Api = Api;
})();

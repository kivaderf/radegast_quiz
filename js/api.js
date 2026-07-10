/* ============================================================
   api.js — komunikace se serverem + offline fronta
   Verze 1: API_BASE je null, takže se nic neposílá. Výsledky se
   hromadí lokálně a odešlou se automaticky, jakmile API nastavíš
   a bude dostupné. Jedno ID = jeden záznam (žádné duplicity).
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var Store = window.Store;

  // fetch s časovým limitem – po API_TIMEOUT_MS to vzdáme
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
    /* Kontrola ID před testem.
       Vrací { allowed: bool, reason: string }
         - reason "already": ID už test absolvovalo -> zákaz
       Pravidla:
         1) Když je ID lokálně vedené jako dokončené -> zákaz (i offline).
         2) Když je API nastavené, zeptáme se serveru (exists=true -> zákaz).
         3) Když API chybí nebo je nedostupné -> POVOLIT (fail-open). */
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
          // nedostupné API -> pustíme dál (podle zadání)
          return { allowed: true, reason: "offline" };
        });
    },

    /* Uloží výsledek: nejdřív lokálně (dedup podle ID), pak zkusí odeslat. */
    saveResult: function (record) {
      Store.markCompleted(record.id);
      Store.enqueue(record);
      return Api.flushQueue();
    },

    /* Pokusí se odeslat vše z fronty. Bez API nebo offline jen tiše skončí. */
    flushQueue: function () {
      var queue = Store.getQueue();
      if (!Cfg.API_BASE || !navigator.onLine || queue.length === 0) {
        return Promise.resolve({ sent: 0, pending: queue.length });
      }
      var sent = 0;
      // odesíláme postupně, ať server nezahltíme
      return queue
        .reduce(function (chain, rec) {
          return chain.then(function () {
            return fetchWithTimeout(Cfg.API_BASE + Cfg.ENDPOINTS.result, {
              method: "POST",
              headers: headers(),
              body: JSON.stringify(rec)
            })
              .then(function (res) {
                // 200/201 = uloženo; 409 = server už záznam má -> taky OK
                if (res.ok || res.status === 409) {
                  Store.removeFromQueue(rec.id);
                  sent++;
                }
              })
              .catch(function () {
                /* necháme ve frontě na příště */
              });
          });
        }, Promise.resolve())
        .then(function () {
          return { sent: sent, pending: Store.queueSize() };
        });
    }
  };

  // Zkusit odeslat frontu, kdykoli se objeví síť.
  window.addEventListener("online", function () {
    Api.flushQueue();
  });

  window.Api = Api;
})();

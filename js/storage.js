/* ============================================================
   storage.js — lokální paměť (localStorage)
   Drží tři věci:
     1) recent  – naposledy použité otázky (anti-repeat mezi testy)
     2) queue   – výsledky čekající na odeslání na server
     3) done    – ID, která už test dokončila (kvůli duplicitám)
   ============================================================ */
(function () {
  "use strict";

  var K = {
    recent: "ra_recent_questions",
    queue: "ra_result_queue",
    done: "ra_done_ids"
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* soukromý režim / plná paměť – aplikace běží dál bez perzistence */
    }
  }

  var Store = {
    /* ---- Anti-repeat ------------------------------------------- */
    getRecent: function () {
      return read(K.recent, []);
    },
    // Přidá právě odehrané otázky na konec a ořízne na délku cooldownu.
    pushRecent: function (ids, cooldown) {
      var list = read(K.recent, []).concat(ids);
      if (list.length > cooldown) list = list.slice(list.length - cooldown);
      write(K.recent, list);
    },

    /* ---- Dokončená ID (duplicity) ----------------------------- */
    isCompleted: function (id) {
      return read(K.done, []).indexOf(String(id)) !== -1;
    },
    markCompleted: function (id) {
      var list = read(K.done, []);
      if (list.indexOf(String(id)) === -1) {
        list.push(String(id));
        write(K.done, list);
      }
    },

    /* ---- Fronta výsledků k odeslání --------------------------- */
    getQueue: function () {
      return read(K.queue, []);
    },
    // Zařadí výsledek; jedno ID nikdy dvakrát (ochrana proti duplicitám).
    enqueue: function (record) {
      var q = read(K.queue, []);
      var exists = q.some(function (r) {
        return String(r.id) === String(record.id);
      });
      if (!exists) {
        q.push(record);
        write(K.queue, q);
      }
      return !exists;
    },
    removeFromQueue: function (id) {
      var q = read(K.queue, []).filter(function (r) {
        return String(r.id) !== String(id);
      });
      write(K.queue, q);
    },
    queueSize: function () {
      return read(K.queue, []).length;
    },

    /* ---- Servis ----------------------------------------------- */
    exportAll: function () {
      return {
        recent: read(K.recent, []),
        queue: read(K.queue, []),
        done: read(K.done, [])
      };
    }
  };

  window.Store = Store;
})();

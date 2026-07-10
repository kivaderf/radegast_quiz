/* ============================================================
   storage.js — local persistence (localStorage)
   Holds three things:
     1) recent  – recently used questions (anti-repeat between tests)
     2) queue   – results waiting to be sent to the server
     3) done    – IDs that already completed the test (to prevent duplicates)
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
      /* private mode / storage full – app keeps running without persistence */
    }
  }

  var Store = {
    /* ---- Anti-repeat ------------------------------------------- */
    getRecent: function () {
      return read(K.recent, []);
    },
    // Appends the just-played questions and trims to the cooldown length.
    pushRecent: function (ids, cooldown) {
      var list = read(K.recent, []).concat(ids);
      if (list.length > cooldown) list = list.slice(list.length - cooldown);
      write(K.recent, list);
    },

    /* ---- Completed IDs (duplicates) ----------------------------- */
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

    /* ---- Queue of results to send --------------------------- */
    getQueue: function () {
      return read(K.queue, []);
    },
    // Enqueues a result; the same ID is never queued twice (duplicate protection).
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

    /* ---- Utilities ----------------------------------------------- */
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

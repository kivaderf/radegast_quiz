/* ============================================================
   config.js — all settings in one place
   Adjust timings, counts and the API address here. Nothing else needed.
   ============================================================ */
(function () {
  "use strict";

  // Shared logger: prefixes every console message with a local date+time
  // stamp, e.g. "[2026-07-15 14:23:01.123]". Used instead of console.log
  // everywhere so the log timeline is readable when reviewing a device
  // after the fact (Safari's own console timestamps aren't always visible).
  window.klog = function () {
    var d = new Date();
    var pad = function (n, len) {
      return String(n).padStart(len || 2, "0");
    };
    var ts =
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      "." + pad(d.getMilliseconds(), 3);
    console.log.apply(console, ["[" + ts + "]"].concat(Array.prototype.slice.call(arguments)));
  };

  window.Config = {
    /* ---- API ------------------------------------------------------
       Both endpoints are GET requests with query params (see api.js
       for exactly how they're called and how the response is read).
       While API_BASE is null, the app runs locally: the ID check
       passes (fail-open) and results are queued in the browser.

       ❗❗❗ BEFORE PUBLISHING: confirm API_BASE below is the PRODUCTION
       URL, not a test/staging one. ❗❗❗
    */
    API_BASE: "https://fwtd.site/api",
    ENDPOINTS: {
      // GET {API_BASE}{check}?hash=<id>            -> { exists: boolean }
      check: "/check_user.php",
      // GET {API_BASE}{result}?hash=<id>&kviz=<X>  -> { success: boolean, value: string }
      result: "/set_kviz.php"
    },
    // Optional auth header (none needed yet).
    // Example: { "Authorization": "Bearer XXX" }
    API_HEADERS: {},
    API_TIMEOUT_MS: 6000, // after this we treat the API as unavailable -> fail-open

    /* ---- Test flow -------------------------------------------- */
    QUESTION_COUNT: 5, // how many questions per test
    TIME_PER_QUESTION_MS: 30000, // 30 s per question

    /* ---- Anti-repeat between tests ---------------------------------
       A question reappears only after this many other questions have
       been asked. The pool has 201 questions, so 150 = plenty of
       variety and nothing repeats right away. (Must be < 201 - QUESTION_COUNT.)
    */
    COOLDOWN_QUESTIONS: 150,

    /* ---- Automatic returns (kiosk) ----------------------------- */
    DENIED_RESET_MS: 10000, // "can't start" screen -> back to ID
    RESULT_RESET_MS: 10000, // result -> automatically starts a new test

    /* ---- Data sources ---------------------------------------------- */
    QUESTIONS_URL: "data/questions.json",
    RESULTS_URL: "data/results.json",

    /* Order of traits (matches the xlsx columns). Don't edit without updating the data. */
    TRAITS: ["strength", "decisiveness", "resilience", "responsibility"]
  };
})();

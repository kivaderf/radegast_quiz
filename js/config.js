/* ============================================================
   config.js — all settings in one place
   Adjust timings, counts and the API address here. Nothing else needed.
   ============================================================ */
(function () {
  "use strict";

  window.Config = {
    /* ---- API (v1: no API) --------------------------------
       Once you have a backend, set API_BASE to its address, e.g.:
         API_BASE: "https://api.yourdomain.com"
       While it's null, the app runs locally: the ID check passes
       (fail-open) and results are queued in the browser.
    */
    API_BASE: null,
    ENDPOINTS: {
      // POST {API_BASE}{check}  body: { id }         -> { exists: boolean }
      check: "/participants/check",
      // POST {API_BASE}{result} body: see api.js      -> 200/201 = saved
      result: "/participants/result"
    },
    // Optional auth header (left empty for v1).
    // Example: { "Authorization": "Bearer XXX" }
    API_HEADERS: {},
    API_TIMEOUT_MS: 6000, // after this we treat the API as unavailable -> fail-open

    /* ---- Test flow -------------------------------------------- */
    QUESTION_COUNT: 5, // how many questions per test
    TIME_PER_QUESTION_MS: 30000, // 30 s per question
    ROULETTE_MS: 1500, // duration of the "roulette" when time expires

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

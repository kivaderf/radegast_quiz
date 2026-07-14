/* ============================================================
   config.js — all settings in one place
   Adjust timings, counts and the API address here. Nothing else needed.
   ============================================================ */
(function () {
  "use strict";

  window.Config = {
    /* ---- API ------------------------------------------------------
       Both endpoints are GET requests with query params (see api.js
       for exactly how they're called and how the response is read).
       While API_BASE is null, the app runs locally: the ID check
       passes (fail-open) and results are queued in the browser.
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

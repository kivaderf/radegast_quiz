/* ============================================================
   app.js — control logic (state machine)
   Screens: ID -> (DENIED) -> QUESTIONS x5 -> RESULT -> back to ID
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var UI = window.UI;
  var Api = window.Api;
  var Quiz = window.Quiz;
  var Store = window.Store;

  var MAX_ID_LEN = 12; // IDs vary in length – cap to avoid breaking the UI

  var state = {
    idValue: "",
    questions: [],
    qIndex: 0,
    answers: [], // { questionId, trait }
    answered: false,
    current: null,
    resultTimer: null,
    deniedTimer: null
  };

  /* ---------- ID screen ---------------------------------- */
  function onIdChange(digits) {
    state.idValue = digits;
    document.getElementById("startBtn").disabled = !digits;
  }

  function onStart() {
    var id = state.idValue;
    if (!id) return;
    document.getElementById("startBtn").disabled = true;
    console.log("[Kvíz] Kontroluji ID:", id);
    Api.checkId(id).then(function (res) {
      console.log("[Kvíz] Výsledek kontroly ID:", res);
      if (res.allowed) {
        beginTest();
      } else {
        showDenied();
      }
    });
  }

  /* ---------- Test flow ---------------------------------- */
  function beginTest() {
    state.questions = Quiz.pickQuestions();
    state.qIndex = 0;
    state.answers = [];
    console.log("[Kvíz] Start testu, ID:", state.idValue);
    UI.showScreen("question");
    renderCurrent();
  }

  function renderCurrent() {
    state.answered = false;
    var q = state.questions[state.qIndex];
    state.current = UI.renderQuestion(
      state.qIndex,
      Cfg.QUESTION_COUNT,
      q,
      onSubmit
    );
    UI.timer.start(Cfg.TIME_PER_QUESTION_MS, onExpire);
  }

  // Manual pick, confirmed via the submit button
  function onSubmit(opt, el) {
    if (state.answered) return;
    state.answered = true;
    UI.timer.stop();
    state.current.lock(el);
    record(opt);
    setTimeout(advance, 550);
  }

  // Time expired -> roulette picks for the user
  function onExpire() {
    if (state.answered) return;
    state.answered = true;
    state.current.showAutoNote();
    UI.roulette(state.current.optionEls).then(function (idx) {
      var opt = state.current.options[idx];
      state.current.lock(state.current.optionEls[idx]);
      record(opt);
      setTimeout(advance, 650);
    });
  }

  function record(opt) {
    var q = state.questions[state.qIndex];
    console.log(
      "[Kvíz] Otázka " + (state.qIndex + 1) + "/" + Cfg.QUESTION_COUNT + ":",
      q
    );
    console.log("[Kvíz] Vybraná odpověď:", opt);
    state.answers.push({ questionId: q.id, trait: opt.trait });
  }

  function advance() {
    state.qIndex++;
    if (state.qIndex < Cfg.QUESTION_COUNT) {
      renderCurrent();
    } else {
      finish();
    }
  }

  /* ---------- Result -------------------------------------- */
  function finish() {
    var evalObj = Quiz.evaluate(
      state.answers.map(function (a) {
        return a.trait;
      })
    );

    var record = {
      id: state.idValue,
      type: evalObj.trait,
      traits: evalObj.counts,
      tie: evalObj.tie,
      answers: state.answers,
      finishedAt: new Date().toISOString()
    };

    console.log("[Kvíz] Vyhodnocení:", evalObj);
    console.log("[Kvíz] Uložený záznam:", record);

    UI.renderResult(evalObj);
    UI.showScreen("result");

    // Save (locally right away, to the server once it's available)
    Api.saveResult(record).then(function (status) {
      console.log("[Kvíz] Stav odeslání:", status);
      if (Cfg.API_BASE && status.pending > 0) {
        UI.setSyncNote("Výsledek uložen, čeká na odeslání.");
      } else if (Cfg.API_BASE) {
        UI.setSyncNote("Výsledek odeslán.");
      } else {
        UI.setSyncNote("");
      }
    });

    clearTimeout(state.resultTimer);
    state.resultTimer = setTimeout(resetToId, Cfg.RESULT_RESET_MS);
  }

  /* ---------- Denied start -------------------------------- */
  function showDenied() {
    console.log("[Kvíz] Start zamítnut pro ID:", state.idValue);
    UI.renderDenied();
    UI.showScreen("denied");
    var secs = Math.round(Cfg.DENIED_RESET_MS / 1000);
    UI.setDeniedCountdown(secs);
    clearInterval(state.deniedTimer);
    state.deniedTimer = setInterval(function () {
      secs--;
      UI.setDeniedCountdown(Math.max(0, secs));
      if (secs <= 0) {
        clearInterval(state.deniedTimer);
        resetToId();
      }
    }, 1000);
  }

  /* ---------- Return to start -------------------------------- */
  function resetToId() {
    console.log("[Kvíz] Reset na úvodní obrazovku.");
    clearTimeout(state.resultTimer);
    clearInterval(state.deniedTimer);
    UI.timer.stop();
    state.idValue = "";
    state.answers = [];
    state.qIndex = 0;
    state.answered = false;
    UI.setIdDisplay("");
    UI.showScreen("id");
    // try sending queued results while things are idle
    Api.flushQueue();
  }

  /* ---------- Kiosk: block escape gestures ------------------ */
  function hardenKiosk() {
    document.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    document.addEventListener("gesturestart", function (e) {
      e.preventDefault(); // Safari pinch-zoom
    });
    document.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });
    // prevent double-tap zoom
    var lastTouch = 0;
    document.addEventListener(
      "touchend",
      function (e) {
        var now = Date.now();
        if (now - lastTouch <= 350) e.preventDefault();
        lastTouch = now;
      },
      { passive: false }
    );
    // keep the screen awake (best-effort)
    requestWakeLock();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") requestWakeLock();
    });
  }

  var wakeLock = null;
  function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock
      .request("screen")
      .then(function (lock) {
        wakeLock = lock;
      })
      .catch(function () {});
  }

  /* ---------- Start ----------------------------------------- */
  function init() {
    UI.init();
    UI.initIdInput(MAX_ID_LEN, onIdChange);
    UI.setIdDisplay("");
    document.getElementById("startBtn").addEventListener("click", onStart);
    document.getElementById("againBtn").addEventListener("click", resetToId);
    hardenKiosk();

    Quiz.load()
      .then(function () {
        console.log(
          "[Kvíz] Data načtena:",
          Quiz.questions.length + " otázek",
          Quiz.results
        );
        UI.showScreen("id");
        Api.flushQueue(); // send any leftovers from before
      })
      .catch(function (err) {
        console.log("[Kvíz] Načtení dat selhalo:", err);
        document.getElementById("qText") &&
          (document.getElementById("startBtn").disabled = true);
        alert("Nepodařilo se načíst data kvízu (data/questions.json).");
      });

    // Temporarily disabled for testing (cache hides file changes).
    // Re-enable before deploying to the iPad.
    // if ("serviceWorker" in navigator) {
    //   navigator.serviceWorker.register("service-worker.js").catch(function () {});
    // }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

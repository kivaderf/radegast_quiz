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
    deniedTimer: null,
    isPreview: false, // true when started via ?result=quiz(-paused) - skips saving
    timerDisabled: false // true when started via ?result=quiz-paused
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
    if (!state.timerDisabled) {
      UI.timer.start(Cfg.TIME_PER_QUESTION_MS, onExpire);
    }
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

    if (state.isPreview) {
      console.log("[Kvíz] Náhled (?result=quiz) - výsledek se neukládá.");
    } else {
      // Save (locally right away, to the server once it's available)
      Api.saveResult(record).then(function (status) {
        console.log("[Kvíz] Stav odeslání:", status);
      });
    }

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
    state.isPreview = false;
    state.timerDisabled = false;
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
    // prevent double-tap zoom (only when tapping the *same* element twice
    // fast - otherwise quick taps on different buttons/options would have
    // their second click silently swallowed)
    var lastTouchTime = 0;
    var lastTouchTarget = null;
    document.addEventListener(
      "touchend",
      function (e) {
        var now = Date.now();
        if (now - lastTouchTime <= 350 && e.target === lastTouchTarget) {
          e.preventDefault();
        }
        lastTouchTime = now;
        lastTouchTarget = e.target;
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

  /* ---------- Dev shortcut: ?result=<handle> jumps straight to a
     screen (skips ID entry) so it's quick to edit/preview:
       ?result=strength | decisiveness | resilience | responsibility -> that result
       ?result=prijato -> "ID already used" (denied) screen
       ?result=quiz -> starts a real quiz run (timer, options, etc.)
       ?result=quiz-paused -> same, but the countdown never starts -
         only the submit button advances questions
     No auto-reset timers are armed for the static previews, so those
     screens stay put while you edit. Query param only, no URL routing -
     works on any static host with no server config. ------------- */
  function previewFromUrl() {
    var handle = new URLSearchParams(location.search).get("result");
    if (!handle) return false;

    if (handle === "prijato") {
      console.log("[Kvíz] Náhled obrazovky 'ID už bylo použito' přes URL (?result=prijato)");
      UI.renderDenied();
      UI.setDeniedCountdown(Math.round(Cfg.DENIED_RESET_MS / 1000));
      UI.showScreen("denied");
      return true;
    }

    if (handle === "quiz" || handle === "quiz-paused") {
      console.log("[Kvíz] Náhled obrazovky otázek přes URL (?result=" + handle + ")");
      state.idValue = "preview";
      state.isPreview = true;
      state.timerDisabled = handle === "quiz-paused";
      beginTest();
      return true;
    }

    if (Cfg.TRAITS.indexOf(handle) === -1) return false;

    var evalObj = {
      trait: handle,
      counts: Cfg.TRAITS.reduce(function (acc, t) {
        acc[t] = t === handle ? Cfg.QUESTION_COUNT : 0;
        return acc;
      }, {}),
      tie: false,
      result: Quiz.results[handle] || {
        trait: handle,
        name: handle,
        title: handle
      }
    };
    console.log("[Kvíz] Náhled výsledku přes URL (?result=" + handle + "):", evalObj);
    UI.renderResult(evalObj);
    UI.showScreen("result");
    return true;
  }

  /* ---------- Start ----------------------------------------- */
  function init() {
    UI.init();
    UI.initIdInput(MAX_ID_LEN, onIdChange);
    UI.setIdDisplay("");
    document.getElementById("startBtn").addEventListener("click", onStart);
    hardenKiosk();

    Quiz.load()
      .then(function () {
        console.log(
          "[Kvíz] Data načtena:",
          Quiz.questions.length + " otázek",
          Quiz.results
        );
        if (!previewFromUrl()) {
          UI.showScreen("id");
        }
        Api.flushQueue(); // send any leftovers from before
      })
      .catch(function (err) {
        console.log("[Kvíz] Načtení dat selhalo:", err);
        document.getElementById("qText") &&
          (document.getElementById("startBtn").disabled = true);
        alert("Nepodařilo se načíst data kvízu (data/questions.json).");
      });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

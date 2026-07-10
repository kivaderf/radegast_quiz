/* ============================================================
   app.js — řídící logika (stavový automat)
   Obrazovky: ID -> (DENIED) -> OTÁZKY x5 -> VÝSLEDEK -> zpět na ID
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var UI = window.UI;
  var Api = window.Api;
  var Quiz = window.Quiz;
  var Store = window.Store;

  var MAX_ID_LEN = 12; // ID je „různě dlouhé“ – strop kvůli rozbití UI

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

  /* ---------- ID obrazovka ---------------------------------- */
  function onIdChange(digits) {
    state.idValue = digits;
    document.getElementById("startBtn").disabled = !digits;
  }

  function onStart() {
    var id = state.idValue;
    if (!id) return;
    document.getElementById("startBtn").disabled = true;
    Api.checkId(id).then(function (res) {
      if (res.allowed) {
        beginTest();
      } else {
        showDenied();
      }
    });
  }

  /* ---------- Průběh testu ---------------------------------- */
  function beginTest() {
    state.questions = Quiz.pickQuestions();
    state.qIndex = 0;
    state.answers = [];
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
      onPick
    );
    UI.timer.start(Cfg.TIME_PER_QUESTION_MS, onExpire);
  }

  // Ruční volba
  function onPick(trait, el) {
    if (state.answered) return;
    state.answered = true;
    UI.timer.stop();
    state.current.lock(el);
    record(trait);
    setTimeout(advance, 550);
  }

  // Vypršel čas -> ruletka vybere za uživatele
  function onExpire() {
    if (state.answered) return;
    state.answered = true;
    state.current.showAutoNote();
    UI.roulette(state.current.optionEls).then(function (idx) {
      var opt = state.current.options[idx];
      state.current.lock(state.current.optionEls[idx]);
      record(opt.trait);
      setTimeout(advance, 650);
    });
  }

  function record(trait) {
    state.answers.push({
      questionId: state.questions[state.qIndex].id,
      trait: trait
    });
  }

  function advance() {
    state.qIndex++;
    if (state.qIndex < Cfg.QUESTION_COUNT) {
      renderCurrent();
    } else {
      finish();
    }
  }

  /* ---------- Výsledek -------------------------------------- */
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

    UI.renderResult(evalObj);
    UI.showScreen("result");

    // Uložit (lokálně hned, na server až bude dostupný)
    Api.saveResult(record).then(function (status) {
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

  /* ---------- Zákaz spuštění -------------------------------- */
  function showDenied() {
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

  /* ---------- Návrat na úvod -------------------------------- */
  function resetToId() {
    clearTimeout(state.resultTimer);
    clearInterval(state.deniedTimer);
    UI.timer.stop();
    state.idValue = "";
    state.answers = [];
    state.qIndex = 0;
    state.answered = false;
    UI.setIdDisplay("");
    UI.showScreen("id");
    // pokus o odeslání nasbíraných výsledků, když je klid
    Api.flushQueue();
  }

  /* ---------- Kiosk: zamezit únikům/gestům ------------------ */
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
    // zabránit double-tap zoomu
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
    // držet displej rozsvícený (best-effort)
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
        UI.showScreen("id");
        Api.flushQueue(); // odeslat případné resty z minula
      })
      .catch(function () {
        document.getElementById("qText") &&
          (document.getElementById("startBtn").disabled = true);
        alert("Nepodařilo se načíst data kvízu (data/questions.json).");
      });

    // Dočasně vypnuto kvůli testování (cache maskuje změny v souborech).
    // Před nasazením na iPad zase odkomentovat.
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

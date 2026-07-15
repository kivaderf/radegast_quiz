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

  var ID_LEN = 6; // ID is always exactly 6 digits
  var IDLE_MS = 60000; // 1 min with no taps anywhere -> back to the screen saver

  var state = {
    idValue: "",
    questions: [],
    qIndex: 0,
    answers: [], // { questionId, trait }
    answered: false,
    current: null,
    resultTimer: null,
    deniedTimer: null,
    onScreenSaver: false
  };

  /* ---------- Screen saver (idle/attract overlay) ------------ */
  var idleTimer = null;

  function showScreenSaver() {
    console.log("[Kvíz] Zobrazuji screensaver.");
    state.onScreenSaver = true;
    clearTimeout(idleTimer); // no idle countdown while already on the saver
    var saver = document.getElementById("screenSaver");
    saver.classList.remove("is-hiding");
    saver.classList.add("is-active");
  }

  function hideScreenSaver() {
    state.onScreenSaver = false;
    var saver = document.getElementById("screenSaver");
    saver.classList.remove("is-active");
    saver.classList.add("is-hiding");
    setTimeout(function () {
      saver.classList.remove("is-hiding");
    }, 500);
    UI.showScreen("id");
    resetIdleTimer();
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (state.onScreenSaver) return;
    idleTimer = setTimeout(function () {
      console.log("[Kvíz] Nečinnost " + IDLE_MS / 1000 + "s - návrat na screensaver.");
      resetToScreenSaver();
    }, IDLE_MS);
  }

  /* ---------- ID screen (custom keypad, no device keyboard) ------ */
  function setIdValue(digits) {
    state.idValue = digits;
    UI.setIdDisplay(digits);
    document.getElementById("startBtn").disabled = digits.length !== ID_LEN;
  }
  function onIdDigit(d) {
    if (state.idValue.length < ID_LEN) setIdValue(state.idValue + d);
  }
  function onIdBackspace() {
    setIdValue(state.idValue.slice(0, -1));
  }
  function onIdClear() {
    setIdValue("");
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
        showDenied(res.reason);
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

  // Time expired -> do nothing; the question stays open until submitted manually.
  function onExpire() {
    console.log("[Kvíz] Čas na otázku vypršel, žádná akce.");
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
    });

    var secs = Math.round(Cfg.RESULT_RESET_MS / 1000);
    UI.setCountdownText(secs);
    clearInterval(state.resultTimer);
    state.resultTimer = setInterval(function () {
      secs--;
      UI.setCountdownText(Math.max(0, secs));
      if (secs <= 0) {
        clearInterval(state.resultTimer);
        resetToScreenSaver();
      }
    }, 1000);
  }

  /* ---------- Denied start -------------------------------- */
  function showDenied(reason) {
    console.log("[Kvíz] Start zamítnut pro ID:", state.idValue, "- důvod:", reason);
    UI.renderDenied(reason);
    UI.showScreen("denied");
    var secs = Math.round(Cfg.DENIED_RESET_MS / 1000);
    UI.setCountdownText(secs);
    clearInterval(state.deniedTimer);
    state.deniedTimer = setInterval(function () {
      secs--;
      UI.setCountdownText(Math.max(0, secs));
      if (secs <= 0) {
        clearInterval(state.deniedTimer);
        resetToScreenSaver();
      }
    }, 1000);
  }

  /* ---------- Return to the screen saver ---------------------- */
  function resetToScreenSaver() {
    console.log("[Kvíz] Reset na screensaver.");
    clearInterval(state.resultTimer);
    clearInterval(state.deniedTimer);
    UI.timer.stop();
    setIdValue("");
    UI.hideKeypad();
    state.answers = [];
    state.qIndex = 0;
    state.answered = false;
    showScreenSaver();
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
    // Double-tap-to-zoom is already disabled by `touch-action: manipulation`
    // in base.css (no JS workaround needed - a manual one here previously
    // caused fast repeated taps on the same button, e.g. mashing backspace,
    // to have every other tap silently swallowed).
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
    UI.buildKeypad(onIdDigit, onIdBackspace, onIdClear);
    setIdValue("");
    document.getElementById("idDisplay").addEventListener("click", UI.revealKeypad);
    document.getElementById("startBtn").addEventListener("click", onStart);
    document.getElementById("screenSaver").addEventListener("click", hideScreenSaver);
    document.getElementById("deniedBadge").addEventListener("click", resetToScreenSaver);
    // Any tap anywhere resets the idle clock; taps on the saver itself
    // additionally dismiss it (handled by the listener just above).
    document.addEventListener("pointerdown", resetIdleTimer, { passive: true });
    hardenKiosk();

    Quiz.load()
      .then(function () {
        console.log(
          "[Kvíz] Data načtena:",
          Quiz.questions.length + " otázek",
          Quiz.results
        );
        showScreenSaver();
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

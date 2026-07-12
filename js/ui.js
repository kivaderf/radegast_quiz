/* ============================================================
   ui.js — rendering and animation (DOM work)
   Driven by app.js; has no knowledge of quiz state on its own.
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var LETTERS = ["A", "B", "C", "D"];

  function $(sel) {
    return document.querySelector(sel);
  }

  var screens = {
    id: null,
    question: null,
    denied: null,
    result: null
  };

  var UI = {
    init: function () {
      screens.id = $("#screen-id");
      screens.question = $("#screen-question");
      screens.denied = $("#screen-denied");
      screens.result = $("#screen-result");
    },

    showScreen: function (name) {
      Object.keys(screens).forEach(function (k) {
        screens[k].classList.toggle("is-active", k === name);
      });
      var app = $("#app");
      app.classList.toggle("bg-start", name === "id");
      app.classList.toggle("bg-rest", name !== "id");
      console.log("[Kvíz] Pozadí přepnuto na:", name === "id" ? "start" : "rest");
    },

    /* ---------- ID (text field with the device's numeric keyboard) */
    setIdDisplay: function (value) {
      var input = $("#idInput");
      input.value = value || "";
      $("#startBtn").disabled = !value;
    },

    initIdInput: function (maxLen, onChange) {
      var input = $("#idInput");
      input.maxLength = maxLen;
      input.addEventListener("input", function () {
        var digits = input.value.replace(/\D/g, "").slice(0, maxLen);
        if (digits !== input.value) input.value = digits;
        onChange(digits);
      });
    },

    /* ---------- Question ---------------------------------------- */
    renderQuestion: function (index, total, question, onSubmit) {
      // progress
      $("#qCounter").textContent = "Otázka " + (index + 1) + "/" + total;
      var dots = $("#dots");
      dots.innerHTML = "";
      dots.classList.remove("low");
      for (var i = 0; i < total; i++) {
        var s = document.createElement("span");
        if (i < index) {
          s.className = "done";
        } else if (i === index) {
          s.className = "current";
          s.appendChild(document.createElement("i"));
        }
        dots.appendChild(s);
      }

      $("#qText").textContent = question.text;
      $("#autoNote").className = "auto-note";
      $("#autoNote").textContent = "";

      var wrap = $("#options");
      wrap.className = "options";
      wrap.innerHTML = "";
      var optionEls = [];
      var selectedIdx = -1;

      var submitBtn = $("#submitBtn");
      submitBtn.disabled = true;

      question.options.forEach(function (opt, idx) {
        var b = document.createElement("button");
        b.className = "option";
        b.type = "button";
        b.innerHTML =
          '<span class="tag">' + LETTERS[idx] + "</span>" +
          '<span class="label"></span>';
        b.querySelector(".label").textContent = opt.text;
        b.addEventListener("click", function () {
          if (wrap.classList.contains("locked")) return;
          optionEls.forEach(function (o) {
            o.classList.remove("is-selected");
          });
          b.classList.add("is-selected");
          selectedIdx = idx;
          submitBtn.disabled = false;
        });
        wrap.appendChild(b);
        optionEls.push(b);
      });

      // Re-bound each question so it always closes over the current selection.
      submitBtn.onclick = function () {
        if (selectedIdx === -1 || wrap.classList.contains("locked")) return;
        onSubmit(question.options[selectedIdx], optionEls[selectedIdx]);
      };

      return {
        optionEls: optionEls,
        options: question.options,
        lock: function (pickedEl) {
          wrap.classList.add("locked");
          submitBtn.disabled = true;
          optionEls.forEach(function (o) {
            o.classList.remove("is-selected");
          });
          if (pickedEl) pickedEl.classList.add("is-picked");
        },
        showAutoNote: function () {
          var note = $("#autoNote");
          note.textContent = "Čas vypršel – vybíráme za tebe…";
          note.className = "auto-note show";
          wrap.classList.add("locked");
          submitBtn.disabled = true;
        }
      };
    },

    /* ---------- Timer (requestAnimationFrame) --------------- */
    timer: (function () {
      var raf = null;
      var fillI = null;
      var dots = null;
      return {
        start: function (duration, onExpire) {
          dots = $("#dots");
          fillI = dots.querySelector(".current > i");
          dots.classList.remove("low");
          var t0 = performance.now();
          function frame(now) {
            var remain = Math.max(0, duration - (now - t0));
            var elapsedFrac = 1 - remain / duration;
            if (fillI) fillI.style.transform = "scaleX(" + elapsedFrac + ")";
            var secs = Math.ceil(remain / 1000);
            if (secs <= 10) dots.classList.add("low");
            if (remain <= 0) {
              raf = null;
              onExpire();
              return;
            }
            raf = requestAnimationFrame(frame);
          }
          raf = requestAnimationFrame(frame);
        },
        stop: function () {
          if (raf) cancelAnimationFrame(raf);
          raf = null;
        }
      };
    })(),

    /* ---------- Roulette after time expires ---------------------- */
    // Flashes through the options and decelerates to a stop on a random one. Returns the index.
    roulette: function (optionEls) {
      var ms = Cfg.ROULETTE_MS;
      return new Promise(function (resolve) {
        var n = optionEls.length;
        var target = Math.floor(Math.random() * n);
        var i = Math.floor(Math.random() * n);
        var start = performance.now();
        function clearAll() {
          optionEls.forEach(function (o) {
            o.classList.remove("is-flash");
          });
        }
        function step() {
          clearAll();
          optionEls[i].classList.add("is-flash");
          var progress = (performance.now() - start) / ms;
          if (progress >= 1) {
            clearAll();
            resolve(target);
            return;
          }
          if (progress > 0.82) {
            i = target; // settle on the target option near the end
          } else {
            i = (i + 1) % n;
          }
          var delay = 60 + progress * progress * 220; // slow down
          setTimeout(step, delay);
        }
        step();
      });
    },

    /* ---------- Result -------------------------------------- */
    renderResult: function (evalObj) {
      var r = evalObj.result;
      var root = $("#screen-result");
      root.style.setProperty("--trait-color", "var(--t-" + evalObj.trait + ")");
      $("#resultBadge").src = "assets/trait_" + evalObj.trait + ".png";
      $("#resultBadge").alt = r.title || r.name || "";
      $("#resultType").textContent = r.title || r.name || "";
    },

    /* ---------- Denied start -------------------------------- */
    renderDenied: function () {
      $("#deniedTitle").textContent = "Tento kód už byl použit";
      $("#deniedText").textContent =
        "S tímto číslem už test proběhl. Každý ho může vyplnit jen jednou. " +
        "Za chvíli se vrátíme na úvod.";
    },
    setDeniedCountdown: function (secs) {
      $("#deniedCountdown").innerHTML =
        "Návrat na úvod za <b>" + secs + "</b> s";
    }
  };

  window.UI = UI;
})();

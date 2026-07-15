/* ============================================================
   ui.js — rendering and animation (DOM work)
   Driven by app.js; has no knowledge of quiz state on its own.
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var LETTERS = ["A", "B", "C", "D"];

  // Trait key -> audio file in assets/audio/ (filenames are Czech, trait keys are English)
  var TRAIT_AUDIO = {
    strength: "silny",
    decisiveness: "rozhodny",
    resilience: "odolny",
    responsibility: "zodpovedny"
  };
  var resultAudio = null;

  // Denied-screen copy per reason (see Api.checkId in api.js for what sets each reason).
  var DENIED_TEXTS = {
    "not-found": {
      headline1: "Chyba!",
      headline2: "ID NEEXISTUJE",
      body: "Toto ID jsme nenašli. Zkontroluj si prosím zadané číslo, nebo se zeptej hostesky."
    },
    already: {
      headline1: "Pozor!",
      headline2: "VÝZVA UŽ BYLA PŘIJATA",
      body:
        "Ahoj, podle našich záznamů jsi už dnešní Radegastův kvíz absolvoval.<br><br>" +
        "Tvůj charakter je již zapsán. Běž ukázat svou sílu na Buchar nebo prověř postřeh na Vlkovi a sbírej další body do celonárodního žebříčku."
    }
  };

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
      if (name !== "result" && resultAudio) {
        resultAudio.pause();
      }
      var app = $("#app");
      app.classList.toggle("bg-start", name === "id");
      app.classList.toggle("bg-rest", name !== "id");
      klog("[Kvíz] Pozadí přepnuto na:", name === "id" ? "start" : "rest");
    },

    /* ---------- ID (custom on-screen numpad, no device keyboard) --
       iPadOS ignores type="tel"/inputmode="numeric" and always shows
       its full keyboard with a numbers+symbols page instead of a
       digits-only pad, so a native input can't guarantee a clean
       numpad on iPad. A custom keypad sidesteps the OS keyboard
       entirely and behaves identically on every device. */
    setIdDisplay: function (value) {
      var box = $("#idDisplay");
      box.textContent = value;
    },

    // Keypad stays hidden until the display box is tapped (revealKeypad),
    // so the ID screen starts clean instead of showing the full pad upfront.
    // #screen-id.keypad-open drives the whole transition in CSS: it fades/
    // collapses .id-wrap and the eyebrow while the keypad expands in.
    revealKeypad: function () {
      $("#keypad").classList.add("is-visible");
      $("#screen-id").classList.add("keypad-open");
    },
    hideKeypad: function () {
      $("#keypad").classList.remove("is-visible");
      $("#screen-id").classList.remove("keypad-open");
    },

    buildKeypad: function (onDigit, onBackspace, onClear) {
      var pad = $("#keypad");
      pad.classList.remove("is-visible");
      $("#screen-id").classList.remove("keypad-open");
      pad.innerHTML = "";
      var layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
      layout.forEach(function (key) {
        var b = document.createElement("button");
        b.type = "button";
        if (key === "back") {
          b.className = "key key--action";
          b.textContent = "⌫";
          b.setAttribute("aria-label", "Smazat číslici");
          b.addEventListener("click", function () {
            onBackspace();
          });
        } else if (key === "clear") {
          b.className = "key key--action";
          b.textContent = "C";
          b.setAttribute("aria-label", "Smazat vše");
          b.addEventListener("click", function () {
            onClear();
          });
        } else {
          b.className = "key";
          b.textContent = key;
          b.addEventListener("click", function () {
            onDigit(key);
          });
        }
        pad.appendChild(b);
      });
    },

    /* ---------- Question ---------------------------------------- */
    renderQuestion: function (index, total, question, onSubmit) {
      // progress
      $("#qCounter").textContent = "Otázka " + (index + 1) + "/" + total;
      var dots = $("#dots");
      dots.innerHTML = "";
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

      var qText = $("#qText");
      qText.style.fontSize = "";
      qText.textContent = question.text;
      // Shrink the font until the full question fits within the height cap
      // instead of truncating it (CSS alone can't measure text to fit it).
      // Scaled off the current root font-size (1rem) so this stays
      // proportional on any iPad size, same as the rem-based CSS.
      var rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      var maxHeight = rootPx * (195 / 16);
      var minFontSize = rootPx * (24 / 16);
      var step = rootPx * (2 / 16);
      var fontSize = parseFloat(getComputedStyle(qText).fontSize);
      while (qText.scrollHeight > maxHeight && fontSize > minFontSize) {
        fontSize -= step;
        qText.style.fontSize = fontSize + "px";
      }
      klog("[Kvíz] Velikost textu otázky:", fontSize + "px", "(výška " + qText.scrollHeight + "px)");

      var wrap = $("#options");
      wrap.className = "options";
      wrap.innerHTML = "";
      var optionEls = [];

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
          onSubmit(opt, b);
        });
        wrap.appendChild(b);
        optionEls.push(b);
      });

      return {
        optionEls: optionEls,
        options: question.options,
        lock: function (pickedEl) {
          wrap.classList.add("locked");
          if (pickedEl) pickedEl.classList.add("is-picked");
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
          var t0 = performance.now();
          function frame(now) {
            var remain = Math.max(0, duration - (now - t0));
            var elapsedFrac = 1 - remain / duration;
            if (fillI) fillI.style.transform = "scaleX(" + elapsedFrac + ")";
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

    /* ---------- Result -------------------------------------- */
    renderResult: function (evalObj) {
      var r = evalObj.result;
      var root = $("#screen-result");
      root.style.setProperty("--trait-color", "var(--t-" + evalObj.trait + ")");
      $("#resultBadge").src = "assets/trait_" + evalObj.trait + ".png";
      $("#resultBadge").alt = r.title || r.name || "";
      $("#resultType").textContent = r.title || r.name || "";

      if (resultAudio) resultAudio.pause();
      var audioFile = TRAIT_AUDIO[evalObj.trait];
      if (audioFile) {
        resultAudio = new Audio("assets/audio/" + audioFile + ".mp3");
        resultAudio.play().catch(function (err) {
          klog("[Kvíz] Přehrání zvuku výsledku selhalo:", err);
        });
      }
    },

    /* ---------- Denied start -------------------------------- */
    renderDenied: function (reason) {
      var t = DENIED_TEXTS[reason] || DENIED_TEXTS.already;
      $("#deniedHeadline1").textContent = t.headline1;
      $("#deniedHeadline2").textContent = t.headline2;
      $("#deniedText").innerHTML = t.body;
    },

    /* ---------- Shared: result + denied auto-return countdown -- */
    setCountdownText: function (secs) {
      var text = "Tato obrazovka se za " + secs + "s automaticky přepne na úvod";
      document.querySelectorAll(".countdown-text").forEach(function (el) {
        el.textContent = text;
      });
    }
  };

  window.UI = UI;
})();

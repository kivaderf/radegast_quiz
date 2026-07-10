/* ============================================================
   quiz.js — čistá logika kvízu (bez DOM)
     - načtení otázek a výsledků
     - výběr 5 otázek s anti-repeat pravidlem
     - zamíchání pořadí odpovědí na obrazovce
     - vyhodnocení + férový tie-break
   ============================================================ */
(function () {
  "use strict";

  var Cfg = window.Config;
  var Store = window.Store;

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  var Quiz = {
    questions: [],
    results: {},

    load: function () {
      return Promise.all([
        fetch(Cfg.QUESTIONS_URL).then(function (r) {
          return r.json();
        }),
        fetch(Cfg.RESULTS_URL).then(function (r) {
          return r.json();
        })
      ]).then(function (out) {
        Quiz.questions = out[0].questions || [];
        Quiz.results = out[1] || {};
        return Quiz;
      });
    },

    /* Vybere QUESTION_COUNT otázek:
         - žádné opakování v rámci jednoho testu (výběr bez návratu)
         - přednost mají otázky mimo „cooldown“ okno (anti-repeat mezi testy)
       Vrací otázky se zamíchaným pořadím odpovědí. */
    pickQuestions: function () {
      var count = Cfg.QUESTION_COUNT;
      var recent = Store.getRecent();
      var recentSet = {};
      recent.forEach(function (id) {
        recentSet[id] = true;
      });

      var fresh = Quiz.questions.filter(function (q) {
        return !recentSet[q.id];
      });

      // Pojistka: kdyby cooldown byl moc velký, doplníme z těch starších.
      var pool;
      if (fresh.length >= count) {
        pool = shuffle(fresh);
      } else {
        var stale = Quiz.questions.filter(function (q) {
          return recentSet[q.id];
        });
        pool = shuffle(fresh).concat(shuffle(stale));
      }

      var chosen = pool.slice(0, count);
      Store.pushRecent(
        chosen.map(function (q) {
          return q.id;
        }),
        Cfg.COOLDOWN_QUESTIONS
      );

      // Zamícháme pořadí odpovědí, aby daný typ nebyl pořád na stejném místě.
      return chosen.map(function (q) {
        return {
          id: q.id,
          text: q.text,
          options: shuffle(q.options)
        };
      });
    },

    /* Sečte typy z odpovědí a vybere vítěze.
       Tie-break: náhoda mezi typy se stejným (nejvyšším) počtem –
       jediné férové pravidlo, když odpovědi nemají váhy.
       answers = pole traitů, např. ["sila","odolnost",...] */
    evaluate: function (answers) {
      var counts = {};
      Cfg.TRAITS.forEach(function (t) {
        counts[t] = 0;
      });
      answers.forEach(function (t) {
        if (counts.hasOwnProperty(t)) counts[t]++;
      });

      var max = -1;
      Cfg.TRAITS.forEach(function (t) {
        if (counts[t] > max) max = counts[t];
      });
      var leaders = Cfg.TRAITS.filter(function (t) {
        return counts[t] === max;
      });
      var winner = leaders[Math.floor(Math.random() * leaders.length)];

      return {
        trait: winner,
        counts: counts,
        tie: leaders.length > 1,
        result: Quiz.results[winner] || { trait: winner, name: winner, title: winner, description: "" }
      };
    }
  };

  window.Quiz = Quiz;
  window.shuffle = shuffle;
})();

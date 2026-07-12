/* ============================================================
   quiz.js — pure quiz logic (no DOM)
     - loading questions and results
     - picking 5 questions with the anti-repeat rule
     - shuffling answer order on screen
     - evaluation + fair tie-break
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

    /* Picks QUESTION_COUNT questions:
         - no repeats within a single test (sampling without replacement)
         - questions outside the "cooldown" window are preferred (anti-repeat between tests)
       Returns the questions with shuffled answer order. */
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

      // Safety net: if the cooldown is too large, top up with older ones.
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
      console.log(
        "[Kvíz:Quiz] Výběr otázek – fresh: " + fresh.length +
          ", celkem v poolu: " + Quiz.questions.length +
          ", vybráno ID:",
        chosen.map(function (q) {
          return q.id;
        })
      );
      Store.pushRecent(
        chosen.map(function (q) {
          return q.id;
        }),
        Cfg.COOLDOWN_QUESTIONS
      );

      // Shuffle answer order so a given trait isn't always in the same spot.
      return chosen.map(function (q) {
        return {
          id: q.id,
          text: q.text,
          options: shuffle(q.options)
        };
      });
    },

    /* Tallies traits from the answers and picks a winner.
       Tie-break: random choice among traits with the same (highest) count –
       the only fair rule when answers aren't weighted.
       answers = array of traits, e.g. ["strength","resilience",...] */
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
        result: Quiz.results[winner] || { trait: winner, name: winner, title: winner }
      };
    }
  };

  window.Quiz = Quiz;
  window.shuffle = shuffle;
})();

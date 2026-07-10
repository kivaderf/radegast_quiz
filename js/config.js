/* ============================================================
   config.js — všechna nastavení na jednom místě
   Uprav tady časy, počty a adresu API. Nic dalšího řešit nemusíš.
   ============================================================ */
(function () {
  "use strict";

  window.Config = {
    /* ---- API (verze 1: žádné API) --------------------------------
       Až budeš mít backend, nastav API_BASE na jeho adresu, např.:
         API_BASE: "https://api.mojedomena.cz"
       Dokud je null, běží aplikace lokálně: kontrola ID projde
       (fail-open) a výsledky se ukládají do fronty v prohlížeči.
    */
    API_BASE: null,
    ENDPOINTS: {
      // POST {API_BASE}{check}  telo: { id }         -> { exists: boolean }
      check: "/participants/check",
      // POST {API_BASE}{result} telo: viz api.js      -> 200/201 = uloženo
      result: "/participants/result"
    },
    // Volitelná hlavička pro autorizaci (necháváme prázdné pro v1).
    // Příklad: { "Authorization": "Bearer XXX" }
    API_HEADERS: {},
    API_TIMEOUT_MS: 6000, // po této době bereme API jako nedostupné -> fail-open

    /* ---- Průběh testu -------------------------------------------- */
    QUESTION_COUNT: 5, // kolik otázek v jednom testu
    TIME_PER_QUESTION_MS: 30000, // 30 s na otázku
    ROULETTE_MS: 1500, // délka „ruletky“ při vypršení času

    /* ---- Anti-repeat mezi testy ---------------------------------
       Otázka se znovu objeví až poté, co proběhlo tolik jiných otázek.
       Pool má 201 otázek, takže 150 = velká variabilita a nic se
       hned neopakuje. (Musí být < 201 - QUESTION_COUNT.)
    */
    COOLDOWN_QUESTIONS: 150,

    /* ---- Automatické návraty (kiosk) ----------------------------- */
    DENIED_RESET_MS: 10000, // obrazovka „nelze spustit“ -> zpět na ID
    RESULT_RESET_MS: 30000, // výsledek -> automaticky nový test

    /* ---- Zdroje dat ---------------------------------------------- */
    QUESTIONS_URL: "data/questions.json",
    RESULTS_URL: "data/results.json",

    /* Pořadí typů (odpovídá sloupcům v xlsx). Needituj bez úpravy dat. */
    TRAITS: ["sila", "rozhodnost", "odolnost", "zodpovednost"]
  };
})();

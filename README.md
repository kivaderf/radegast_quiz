# Kvíz osobnosti — PWA (iPad, landscape)

Kioskový osobnostní test: 5 otázek, 4 odpovědi, každá odpověď patří jednomu
ze čtyř typů (**Síla, Rozhodnost, Odolnost, Zodpovědnost**). Vyhrává typ
s nejvíce hlasy; při shodě rozhoduje **náhoda mezi vedoucími typy** (jediné
férové pravidlo, když odpovědi nemají váhy).

## Spuštění

Aplikace musí běžet přes **http/https**, ne otevřením souboru (`file://`) —
kvůli načítání dat a service workeru. Lokálně stačí:

```bash
cd radegast-kviz
python3 -m http.server 8000
# otevři http://localhost:8000
```

Na ostro nahraj celou složku na jakýkoli statický hosting (Netlify, Vercel,
GitHub Pages, vlastní web) — je to jen statické soubory.

## Co kde upravit

| Chci změnit… | Soubor |
| --- | --- |
| Časy, počet otázek, adresu API, cooldown | `js/config.js` |
| Texty výsledků (4 typy) | `data/results.json` |
| Otázky a odpovědi | `data/questions.json` |
| Logo | `assets/logo.svg` (nebo vlastní obrázek + cesta v `index.html`) |
| Pozadí | vyměň `assets/background.svg`, nebo `--bg-image` v `css/base.css` |
| Barvy a fonty | proměnné na začátku `css/base.css` |
| Barvy 4 typů | proměnné `--t-*` v `css/base.css` |

**Po jakékoli změně souborů zvyš `CACHE_VERSION` v `service-worker.js`**,
jinak si zařízení může držet starou verzi z cache.

### Otázky (`data/questions.json`)

Vygenerováno z dodaného xlsx. Pořadí odpovědí ve sloupcích odpovídá typům:

1. sloupec → `sila`
2. sloupec → `rozhodnost`
3. sloupec → `odolnost`
4. sloupec → `zodpovednost`

Na obrazovce se pořadí odpovědí **náhodně zamíchá**, aby daný typ nebyl pořád
na stejné pozici. Klíče `sila/rozhodnost/odolnost/zodpovednost` neměň — jsou
navázané na vyhodnocení a na texty ve `results.json`.

## Napojení na API (až bude hotové)

Verze 1 běží **bez serveru**: kontrola ID projde a výsledky se ukládají do
fronty v prohlížeči. Až budeš mít backend, v `js/config.js` nastav:

```js
API_BASE: "https://tvoje-api.cz",
API_HEADERS: { }, // volitelně např. Authorization
```

Aplikace pak volá dva endpointy:

**1) Kontrola ID — `POST {API_BASE}/participants/check`**
```json
// požadavek
{ "id": "427" }
// odpověď
{ "exists": true }   // true = tohle ID už test absolvovalo → zobrazí se zákaz
```

**2) Uložení výsledku — `POST {API_BASE}/participants/result`**
```json
{
  "id": "427",
  "type": "sila",
  "traits": { "sila": 3, "rozhodnost": 1, "odolnost": 1, "zodpovednost": 0 },
  "tie": false,
  "answers": [ { "questionId": 12, "trait": "sila" }, "..." ],
  "finishedAt": "2026-07-08T12:00:00.000Z"
}
```
Vrať `200`/`201` při uložení. **Server musí být idempotentní podle `id`** —
pokud záznam existuje, vrať `409` (klient to bere jako „uloženo" a přestane
posílat). Tím je zaručeno, že pro jedno ID nevznikne duplicita.

### Chování offline (podle zadání)
- **Kontrola ID** při nedostupném API **propustí** uživatele (fail-open).
- **Výsledky** se ukládají lokálně a **odešlou automaticky**, jakmile je API
  dostupné (při startu, po dokončení testu a při obnovení sítě).
- Jedno ID se do fronty zařadí jen jednou; navíc si zařízení pamatuje už
  dokončená ID, takže na stejném iPadu nejde stejné ID spustit dvakrát.

## iPad / kiosk

1. V Safari otevři adresu appky → **Sdílet → Přidat na plochu**. Spouštěj ji
   z ikony na ploše (běží na celou obrazovku, na šířku, bez adresního řádku).
2. **Zamknutí v aplikaci = Guided Access** (Zpřístupnění → Asistovaný přístup).
   Zapni ho a spusť trojklikem postranního tlačítka. Aplikace sama o sobě
   uživatele v iOS neudrží — tuhle část musí zajistit Guided Access nebo MDM
   (Single App Mode). Vše ostatní (žádný zoom, výběr, kontextové menu,
   uzamčení na šířku, žádné viditelné opuštění testu) appka řeší sama.
3. Displej se snaží držet rozsvícený (Wake Lock); pro jistotu nastav v iPadu
   automatické zamykání na „Nikdy".

## Průběh

ID → (případně obrazovka „už použito") → 5 otázek po 30 s → výsledek →
po 30 s (nebo tlačítkem **Nový test**) zpět na zadání ID.

Když uživatel do 30 s neodpoví, „ruletka" za něj během 1,5 s náhodně vybere
jednu ze čtyř možností a test pokračuje.

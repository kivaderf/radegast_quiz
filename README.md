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

Service worker cachuje jen **obrázky**, a to hned při prvním spuštění appky
(seznam `IMAGES` v `service-worker.js`) — ne až při prvním použití. HTML/CSS/
JS/data se vždy stahují znovu, takže jejich úpravy se projeví hned po
refresh, bez mazání cache. **Když přidáš nový obrázek, přidej jeho cestu i
do `IMAGES`** — jinak se přednačte až při prvním zobrazení, ne dopředu.
Když nahradíš obrázek pod stejným názvem souboru, zvyš `IMAGE_CACHE`
v `service-worker.js`, ať si zařízení nedrží starou verzi.

### Otázky (`data/questions.json`)

Vygenerováno z dodaného xlsx. Pořadí odpovědí ve sloupcích odpovídá typům:

1. sloupec → `strength`
2. sloupec → `decisiveness`
3. sloupec → `resilience`
4. sloupec → `responsibility`

Na obrazovce se pořadí odpovědí **náhodně zamíchá**, aby daný typ nebyl pořád
na stejné pozici. Klíče `strength/decisiveness/resilience/responsibility` neměň —
jsou navázané na vyhodnocení a na texty ve `results.json`.

## Napojení na API

Backend je nastavený v `js/config.js`:

```js
API_BASE: "https://fwtd.site/api",
API_HEADERS: { }, // zatím žádné auth není potřeba
```

Pokud `API_BASE` necháš `null`, aplikace běží bez serveru: kontrola ID
projde (fail-open) a výsledky se jen hromadí ve frontě v prohlížeči.

Aplikace volá dva endpointy — oba jsou **GET s parametry v URL**, ne
POST/JSON:

**1) Kontrola ID — `GET {API_BASE}/check_user.php?hash=<id>`**
```json
{ "exists": true }   // true = tohle ID (hash) už test absolvovalo → zobrazí se zákaz
```

**2) Uložení výsledku — `GET {API_BASE}/set_kviz.php?hash=<id>&kviz=<TYP>`**

`kviz` je vítězný typ jako velkými písmeny bez diakritiky (viz mapování
v `js/api.js`, `KVIZ_PARAM`):

| Náš typ (interně) | Hodnota `kviz` |
| --- | --- |
| `strength` | `SILNY` |
| `decisiveness` | `ROZHODNY` |
| `resilience` | `ODHODLANY` |
| `responsibility` | `SPOLEHLIVY` |

Odpověď:
```json
{ "success": true, "value": "ODHODLANÝ" }
```
`success: true` znamená uloženo → záznam se smaže z lokální fronty.
`success: false` (nebo chyba sítě) → zůstává ve frontě a zkusí se znovu
příště (při startu, po dokončení dalšího testu, při obnovení sítě).

Podrobnosti o dalších polích záznamu (`traits`, `answers`, `tie`,
`finishedAt`) — ty se aktuálně ukládají jen lokálně (`Store.getQueue()`
v konzoli), server dostává jen `hash` + vítězný `kviz`.

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

Když uživatel do 30 s neodpoví, nic se nestane — otázka zůstane zobrazená
a čeká na ruční potvrzení tlačítkem, dokud uživatel odpověď nevybere a
nepotvrdí.

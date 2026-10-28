# CS2 2D Demo Viewer — kontekst projektu

Przeglądarka dem Counter-Strike 2 w 2D, działająca w całości w przeglądarce (również na telefonie).
Użytkownik wrzuca plik `.dem`, parser WASM przetwarza go lokalnie w Web Workerze, a aplikacja
pokazuje radar z graczami, HUD, czas rundy/bomby i odtwarzanie z przewijaniem.

- Repo: https://github.com/reformedmexuuu/2d-dem-view (gałąź `main`)
- Strona: https://reformedmexuuu.github.io/2d-dem-view/ (GitHub Pages, deploy przez GitHub Actions)
- Komunikacja z użytkownikiem i teksty w UI: **po polsku**.

## Sposób pracy (ustalony z użytkownikiem)

- Zmiany robimy **lokalnie**, a na GitHuba wrzucamy dopiero finalną wersję (jeden push na `main`
  uruchamia deploy na Pages). Nie pushuj po każdej drobnej zmianie.
- Aplikacja ma być dobrze zoptymalizowana pod telefon (pion i poziom) oraz desktop.

## Stos i uruchomienie

- Vite 6 + React 19 + TypeScript, rysowanie na Canvas 2D, bez innych bibliotek UI.
- `npm install`, potem `npm run dev`.
- Parser nie jest paczką npm. To dwa pliki w `public/parser/` (w `.gitignore`):
  `demoparser2.js` i `demoparser2_bg.wasm`. Lokalnie najprościej pobrać je z działającej strony:
  `https://reformedmexuuu.github.io/2d-dem-view/parser/demoparser2.js` i `.../parser/demoparser2_bg.wasm`.
  Zbudowanie ich samodzielnie wymaga Rusta, wasm-pack i protoc (`npm run parser`, skrypt bash).
- Radary map: `npm run maps` pobiera je do `public/maps/` (też w `.gitignore`). Bez nich aplikacja
  rysuje obrys mapy na podstawie ruchu graczy.
- `npm run typecheck` uruchamia `tsc --noEmit`; `npm run build` buduje do `dist/`.

## Struktura

```
src/
  App.tsx                 ekran startowy (upload, postęp), Viewer (pętla zegara, skróty, sloty graczy, snapshot UI)
  clock.ts                Clock: mutowalny zegar odtwarzania (tick, playing, speed), SPEEDS 0.25–4
  timeline.ts             sampleAt (wyszukiwanie binarne + interpolacja), playerState, roundIndexAt,
                          roundClock (fazy: freeze/live/bomb/defused/exploded/over), ROUND_TIME 115 s, BOMB 40 s
  maps.ts                 ładowanie public/maps/<map>.json + .png, projekcja świat→radar (pos_x, pos_y, scale)
  types.ts                DemoData (typed arrays), RoundInfo, KillEvent, UtilEvent, komunikaty workera
  render/draw.ts          drawScene: radar, granaty, C4, krzyżyki śmierci, gracze (stożek widzenia, HP, numer slotu)
  components/
    RadarCanvas.tsx       canvas + pętla rAF, pan/zoom (mysz, pinch, dwuklik = reset)
    Hud.tsx               ScoreBar, TeamPanel (wiersze graczy), KillFeed
    Controls.tsx          suwak ze znacznikami rund, przyciski, prędkość, poziom mapy, chipy rund
  parser/
    worker.ts             ładowanie parsera, wywołania parseEvents/parseTicks, normalizacja wyników, diagnostyka
    build.ts              czysta logika: computeRounds, computeRange, computeKills, computeUtils, buildFrames, assemble
    createWorker.ts       new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  styles.css              ciemny motyw; media queries: telefon pion (radar u góry, gracze 2 kolumny), telefon poziom
scripts/
  build-parser.sh         klonuje LaihoE/demoparser, łata (patch-parser.sh), buduje wasm-pack --target no-modules,
                          robi smoke test (test-pipeline.mjs na src/parser/test_demo.dem z repo parsera);
                          gdy coś padnie, używa starej paczki npm `demoparser2` (0.15.0) i wypisuje ::warning::
  patch-parser.sh         podmienia std::time:: -> web_time:: w parserze (+ dodaje dependency web-time)
                          i dopisuje eksport setPanicHook() do src/wasm/src/lib.rs
  test-pipeline.mjs       uruchamia parser w Node (vm) + build.ts na prawdziwym demie, wypisuje podsumowanie
  fetch-maps.mjs          radary z github.com/MurkyYT/cs2-map-icons (images/radars/<map>_radar_psd.png,
                          data/radar_info/<map>.txt -> pos_x/pos_y/scale, verticalsections "lower" AltitudeMax)
.github/workflows/deploy.yml   push na main: npm install -> protoc + npm run parser -> npm run maps -> typecheck
                               (informacyjnie) -> vite build -> GitHub Pages
```

## Przepływ danych

1. `App` tworzy workera i wysyła `{ type: 'parse', file, parserBase }` (`parserBase` = `<base>/parser/`).
2. Worker pobiera `demoparser2.js` jako tekst i wykonuje go przez `new Function(...)`. To build `no-modules`,
   który definiuje globalną funkcję `wasm_bindgen` (init) z dołączonymi funkcjami. Potem
   `await wb(urlDoWasm)` i `wb.setPanicHook()`.
3. `parseHeader` daje `map_name`. `parseEvents(buf, EVENT_NAMES, ['X','Y','Z','team_num'], ['total_rounds_played','is_warmup_period'])`
   zwraca płaską tablicę obiektów `{ tick, event_name, ...pola, user_X, attacker_name, ... }`
   (zweryfikowane na prawdziwym demie). Wyniki mogą być Mapami, a `plain()` je konwertuje.
4. Na podstawie zdarzeń liczone są rundy (`computeRounds`, bez warmupu) i zakres ticków. Potem
   `parseTicks(buf, props, Int32Array próbek)` co 4 ticki (co 8 przy długich demach lub małej pamięci).
   Tickrate przyjęty jako 64.
5. `buildFrames` pakuje wiersze do typed arrays `[próbka * liczbaGraczy + gracz]` i usuwa puste próbki.
   Wynik idzie do wątku głównego jako transferables.
6. UI aktualizuje się co ok. 90 ms, a canvas rysuje każdą klatkę z `clock.tick` (interpolacja między próbkami).

## Ważne ustalenia (nie powtarzać błędów)

- **Paczka npm `demoparser2` jest przestarzała** (0.15.0, build `no-modules`, brak eksportów ES; bundler
  widzi tylko `default`). Dlatego parser budujemy ze źródeł w CI i ładujemy w runtime z `public/parser/`.
- **Najnowszy demoparser panikuje w WASM** przez `std::time::Instant` („time not implemented on this
  platform”, w przeglądarce widoczne jako `unreachable`). `patch-parser.sh` to naprawia (web-time).
  Jeśli upstream zmieni kod, sprawdź `grep -rn "std::time" src/parser/src`.
- W `parseTicks` najnowszej wersji sygnatura to `(file, wanted_props, wanted_ticks, wanted_players, struct_of_arrays)`.
  Przekazujemy 3 argumenty.
- Proxy w sesji chmurowej blokowało npm i większość domen. Lokalnie tego problemu nie ma.
- Test lokalny bez prawdziwego parsera: atrapa `wasm_bindgen` w `public/parser/demoparser2.js`
  (funkcja init z dołączonymi `parseHeader/parseEvents/parseTicks` zwracającymi syntetyczne dane).
- Zrzuty ekranu UI były sprawdzane w Playwright na iPhone 13 (390×844), w poziomie 844×390 i na desktopie 1440×900.

## Znane problemy / TODO

1. **Błędny wynik meczu (PRIORYTET).** Prawdziwy wynik 13:11, aplikacja pokazuje 15:9.
   Przyczyna: `computeRounds` liczy `scoreT/scoreCT` według **strony** zwycięzcy (`winner` 2=T, 3=CT),
   a po przerwie (po 12. rundzie, MR12) i w dogrywkach drużyny zamieniają się stronami.
   Plan naprawy: rozpoznawać **drużyny** po składzie graczy. Na `freezeEndTick` każdej rundy (z `frames`)
   sprawdzić `team_num` graczy. Drużyna A = gracze po stronie CT w 1. rundzie. Dla każdej rundy wyznaczyć
   stronę drużyny A (większość jej graczy), przypisać zwycięstwo drużynie, a w `RoundInfo` trzymać wynik
   drużyny aktualnie grającej jako T/CT (tak jak HUD w CS2). Liczyć to po `buildFrames`, np. w `assemble`
   albo w nowej funkcji w `build.ts`, i dodać sprawdzenie do `test-pipeline.mjs`.
   Kolor chipów rund / znaczników na osi może zostać według strony zwycięzcy.
2. Brak nazw drużyn (można spróbować propa `team_clan_name`).
3. Nie ma pokazywania nosiciela bomby ani upuszczonej bomby. Pokazywane jest tylko miejsce podłożenia.
4. Granaty to tylko punkty detonacji (bez trajektorii; jest `parseGrenades` w parserze).
5. Pliki `.dem.bz2` trzeba rozpakować ręcznie.
6. W repo może jeszcze istnieć tymczasowa gałąź `inspect-parser` (diagnostyka). Można ją usunąć.

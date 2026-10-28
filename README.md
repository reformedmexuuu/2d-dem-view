# 2d-dem-view: CS2 2D Demo Viewer

Przeglądarka dem z Counter-Strike 2 w 2D, działająca w całości w przeglądarce (również na telefonie).
Wrzucasz plik `.dem`, a parser [demoparser2](https://github.com/LaihoE/demoparser) (WebAssembly) przetwarza go lokalnie, w Web Workerze. Nic nie jest wysyłane na serwer.

## Funkcje

- radar mapy z graczami, kierunkiem patrzenia, HP i numerami slotów
- czas rundy, freeze time i 40-sekundowy licznik bomby z paskiem
- wynik, kill feed, granaty (smoke, molotov, HE, flash), miejsce podłożenia C4
- panele drużyn: HP, pancerz/hełm, zestaw do rozbrajania, broń, pieniądze, K/D
- odtwarzanie i pauza, przewijanie ±5 s, suwak osi czasu ze znacznikami rund
- skok do dowolnej rundy, prędkość 0.25×–4×
- przybliżanie i przesuwanie mapy (kółko myszy / pinch), dwuklik resetuje widok
- przełącznik poziomów dla map dwupoziomowych (Nuke, Vertigo, Train)
- układ na telefon w pionie i poziomie

Skróty: `spacja` – play/pauza, `←/→` – ±5 s, `Shift+←/→` – poprzednia/następna runda, `[ ]` – prędkość.

## Uruchomienie lokalnie

```bash
npm install
npm run maps   # pobiera radary map do public/maps (opcjonalne)
npm run dev
```

Radary map są pobierane przy budowaniu z [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons).
Jeśli dla mapy nie ma radaru, aplikacja rysuje obrys mapy na podstawie ruchu graczy.

## Ograniczenia

- tylko dema CS2 (`.dem`); pliki `.dem.bz2` z meczów Valve trzeba najpierw rozpakować
- duże dema (300 MB+) zajmują sporo pamięci; na słabszych telefonach pozycje są próbkowane rzadziej
- tickrate przyjęty jako 64, czas rundy 1:55

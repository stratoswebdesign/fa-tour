# Fa Tour

A Fa Tour jótékonysági vándorkiállítás weboldalának prototípusa (Stratos Media · Impact Program).
Görgetéssel bejárható erdő-galéria: a festmények aranykeretben függnek a fák között, megnyithatók, a séta végén pedig hajnalodik.

## Futtatás

Nincs build lépés. A mappát bármilyen statikus szerverrel ki lehet szolgálni:

```bash
python3 -m http.server 4175
```

Ezután: http://localhost:4175

A `?debug` címmel (`http://localhost:4175/?debug`) elérhető a `window.__fa` teszt-horog.

## Felépítés

- `index.html`, `styles.css` – az oldal váza és a tipográfia
- `src/main.js` – betöltés, belépés, görgetés, a képek megnyitása
- `src/world.js` – az erdő (fák, köd, fények, hajnal)
- `src/paintings.js` – a képek adatai, a keret és a festményanyag
- `src/audio.js` – generált háttérhang
- `src/path.js` – az ösvény és a közös segédfüggvények
- `assets/paintings/` – a mintaképek

## Állapot

Prototípus. A képcímek munkacímek; a technika, a méret és az ár még hiányzik.
A three.js és a Lenis jelenleg CDN-ről töltődik, élesítés előtt csomagolni kell.
A festmények Moldvai Réka alkotásai, minden joguk a művészé.

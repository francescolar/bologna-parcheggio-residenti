# Bologna – parcheggio residenti

Mappa delle zone di sosta riservata ai residenti di Bologna. Ogni via dello stradario comunale viene colorata in base alla sua zona; si può impostare la propria zona, nascondere le altre e vedere la propria posizione.

## Come funziona

- `server.js` (Express) scarica lo stradario dagli [open data del Comune](https://opendata.comune.bologna.it) e le geometrie delle strade da OpenStreetMap (Overpass), poi le abbina per nome (normalizzazione, tipi composti, numeri in lettere, prefissi/suffissi, correzioni manuali in `CORRECTIONS`). Espone `GET /api/streets`.
- Le geometrie OSM sono salvate in `cache/` (TTL 7 giorni). Se cambia la query Overpass, incrementare `CACHE_VERSION`.
- `public/` è il frontend (Leaflet, PWA). La zona scelta e le zone nascoste stanno in `localStorage`.
- `android/` è un wrapper WebView che punta all'indirizzo del server (stesso WiFi), con permesso di geolocalizzazione. Build tramite `android/Dockerfile`; stato della build non verificato.

## Avvio

```sh
npm install
npm start          # http://localhost:3000  (PORT per cambiare porta)
```

Docker:

```sh
docker compose up -d --build
```

La cartella `cache/` è montata come volume, quindi sopravvive ai riavvii. Al primo avvio (o a cache scaduta) il download da Overpass può richiedere diversi minuti.

## Stato

Match stradario ↔ OSM: 1021/1023 vie. Senza corrispondenza: `DE MELLO (PIAZZA)`, `NETTUNO (PIAZZA)`.

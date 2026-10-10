# ParResBo

**Par**cheggio **Res**identi **Bo**logna – mappa delle zone di sosta riservata ai residenti di Bologna. Ogni via dello stradario comunale viene colorata in base alla sua zona; si può impostare la propria zona, nascondere le altre e vedere la propria posizione.

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

## Test

```sh
npm test    # node:test, nessuna rete: matching, API (503 in caricamento, gzip, healthcheck), PWA (manifest, icone, service worker)
```

## Domini

- Web / PWA: `parresbo.laruffa.dev`
- App Android (WebView che punta solo a questo dominio): `parresbo-app.laruffa.dev`

Sono due domini sullo stesso servizio Coolify: l'header `Host` permette di distinguere (es. nei log) chi arriva da web e chi dall'app.

## Variabili d'ambiente

- `PORT` – porta HTTP (default 3000)
- `OVERPASS_CONTACT` – email o URL inserito nello User-Agent verso Overpass (default: URL del repo)

## Deploy (Coolify)

Build pack **Dockerfile**, porta 3000, storage persistente su `/app/cache`, dominio con HTTPS. Healthcheck: `GET /healthz` (risponde subito; `ready:true` a dati caricati). Finché il primo download non è finito `/api/streets` risponde `503` e il client riprova da solo.

## Stato

Match stradario ↔ OSM: 1021/1023 vie. Senza corrispondenza: `DE MELLO (PIAZZA)`, `NETTUNO (PIAZZA)`.

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
docker compose up -d --build   # http://127.0.0.1:3100 (HOST_PORT per cambiare)
```

La cache Overpass sta in un volume Docker (`parresbo-cache`), quindi sopravvive ai riavvii e ai deploy. Al primo avvio (o a cache scaduta) il download da Overpass può richiedere diversi minuti.

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
- `DEBUG_PASSWORD` – password per sbloccare la modalità debug (posizione simulata). Vuota/non impostata = debug disattivato. Si sblocca da Impostazioni toccando 5 volte la versione.

## Deploy (Coolify + Apache come reverse proxy)

Build pack **Docker Compose** (usa `docker-compose.yml`). Il container espone solo `127.0.0.1:${HOST_PORT:-3100}`; Apache fa da reverse proxy con HTTPS verso quella porta per entrambi i domini. Healthcheck: `GET /healthz` (risponde subito; `ready:true` a dati caricati). Finché il primo download non è finito `/api/streets` risponde `503` e il client riprova da solo.

## Stato

Match stradario ↔ OSM: 1021/1023 vie. Senza corrispondenza: `DE MELLO (PIAZZA)`, `NETTUNO (PIAZZA)`.

## Android Auto

Nell'APK c'è anche un'app per Android Auto (`android/app/src/main/java/dev/laruffa/parresbo/car/`, Car App Library, categoria *parking*): mostra SÌ / NO! in base alla posizione del telefono e alla zona scelta, e nel NO! propone la navigazione verso il punto più vicino della propria zona. La zona è condivisa con l'app tramite `Prefs`. Una WebView non è ammessa su Android Auto, quindi la UI è nativa; la logica di ricerca è la stessa di `public/geo.js` ed è coperta da test JUnit (`gradle testDebugUnitTest`).

Prima di pubblicare su Google Play: sostituire `ALLOW_ALL_HOSTS_VALIDATOR` in `ParResBoCarService` con l'elenco degli host ammessi.

### Provarla
Guida passo passo (e script): `docs/android-auto-testing.md`, `scripts/dhu.sh`. In breve:
1. Sul telefono: Android Auto → Impostazioni → toccare 10 volte "Versione" → menu ⋮ → *Impostazioni sviluppatore* → attivare *Origini sconosciute*.
2. Con l'auto: collegare il telefono. Senza auto: Desktop Head Unit (SDK Manager → SDK Tools → *Android Auto Desktop Head Unit Emulator*): in Android Auto *Avvia server unità principale*, poi `adb forward tcp:5277 tcp:5277` e avviare `desktop-head-unit`.

## Versione di produzione (Google Play)
Vedi `docs/play-store.md`: build firmata (`gradle bundleRelease`), chiave di upload fuori dal repo, passaggi della Play Console, Android Auto, informativa privacy (`/privacy`) e note per i revisori. Materiali per la scheda in `store/`.

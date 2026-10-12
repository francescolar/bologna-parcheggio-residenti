# Provare ParResBo su Android Auto (senza auto)

L'emulatore dell'auto (**Desktop Head Unit**, DHU) è già installato in
`~/Android/Sdk/extras/google/auto/desktop-head-unit`.

## Una tantum (già fatto)
1. Telefono: **Opzioni sviluppatore → Debug USB** attivo.
2. Android Auto → Impostazioni → toccare 10 volte "Versione" → menu ⋮ → **Impostazioni sviluppatore** →
   attivare **Origini sconosciute** (serve per le app non scaricate da Play, cioè gli APK di prova).
3. Aver installato l'app sul telefono e dato il permesso di posizione.

## Ogni volta
1. **Collega il telefono al PC con il cavo USB** (sblocca lo schermo, accetta "Consenti debug USB" se lo chiede).
2. **Installa/aggiorna l'app** se serve (build di sviluppo, quella con l'elenco host aperto):
   ```sh
   adb install -r android/parresbo-debug.apk
   ```
   La versione `release` firmata funziona sull'auto vera ma **non** sul DHU di sviluppo con host non Google.
3. Sul telefono: apri **Android Auto** → menu ⋮ in alto a destra → **Avvia server unità principale**
   (compare la notifica "Server unità principale avviato").
4. Sul PC, dalla cartella del progetto:
   ```sh
   scripts/dhu.sh
   ```
   (fa `adb forward tcp:5277 tcp:5277` e avvia `desktop-head-unit`.)
5. Si apre la finestra dell'auto: nell'elenco app c'è **ParResBo**.

## Cambiare la risoluzione
Passa il profilo allo script:
```sh
scripts/dhu.sh 1080p     # 1920×1080 (consigliato per gli screenshot dello store)
scripts/dhu.sh 720p      # 1280×720
scripts/dhu.sh 480p      # 800×480 (predefinito)
scripts/dhu.sh wide      # schermo largo con margini
scripts/dhu.sh 6in       # piccolo, con margini
scripts/dhu.sh rotary    # comandi a manopola
```
Sono i file in `~/Android/Sdk/extras/google/auto/config/`. Per una risoluzione tua, copia uno di quei file
(es. `default_720p.ini`) in un tuo `miaauto.ini`, cambia `resolution = 1280x720` e `dpi = 160`, poi `scripts/dhu.sh miaauto.ini`.
Un `dpi` più alto rende testi e bottoni più grandi. Gli altri parametri del file: `framerate`, `marginwidth`/`marginheight`,
e la sezione `[sensors]` (posizione, modalità notte, stato di guida).

## Posizione di prova (se non sei a Bologna)
ParResBo usa la posizione **del telefono**, non quella dell'auto. Lascia la posizione del telefono **attiva** e
lancia, in un altro terminale:
```sh
scripts/fake-location.sh                    # Bologna, Via Indipendenza (zone 1, 4, 5)
scripts/fake-location.sh 44.5058 11.3433    # coordinate a scelta
```
Imposta una posizione finta su tutti i fornitori del telefono (gps, rete, fused), la rinnova ogni 2 secondi e, con
**Ctrl+C**, la toglie. Serve Android 12 o più recente e il telefono collegato con il debug USB (lo script concede da solo il
permesso di posizione fittizia ad adb). Subito dopo lo stop il telefono può tenere ancora per un po' l'ultima posizione.

Il comando `location 44.4949 11.3426` scritto nel terminale dell'emulatore cambia invece la posizione *dell'auto*: la usa
Google Maps sull'auto, non ParResBo.

## Screenshot per Google Play
Cattura la finestra del DHU con lo screenshot del sistema. Schermate utili: avviso iniziale, SÌ, NO! con il bottone
del parcheggio più vicino, scelta della zona.

## Se qualcosa non va
- *ParResBo non compare nell'elenco*: controlla "Origini sconosciute" e di aver installato la build di sviluppo.
- *Il DHU non si collega*: ripeti il punto 3 (il server si ferma quando chiudi Android Auto) e rilancia `scripts/dhu.sh`.
- `adb devices` non vede il telefono: cavo/porta USB diversi, riaccetta il debug USB.

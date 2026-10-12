# Pubblicare ParResBo su Google Play (con Android Auto)

Un solo pacchetto (`dev.laruffa.parresbo`): l'app per Android Auto è dentro lo stesso file dell'app per il telefono.

## Build di produzione

```sh
# una tantum: chiave di upload FUORI dal repo
mkdir -p ~/.config/parresbo-signing   # upload.jks + signing.properties (storeFile, storePassword, keyAlias, keyPassword)
# build (JDK 17, Gradle 8.14, SDK con platform 36 e build-tools 36.1.0)
cd android && gradle bundleRelease assembleRelease
# → app/build/outputs/bundle/release/app-release.aab   (da caricare su Play)
# → app/build/outputs/apk/release/app-release.apk      (solo per prove via sideload)
```
Incrementare `versionCode` in `android/app/build.gradle` a ogni caricamento. **Fare un backup** di `upload.jks` e della password: serve per ogni aggiornamento (se si perde, Google può reimpostare la chiave di upload, ma è una procedura lunga).

## Prima di inviare
- Il sito deve essere online con l'ultima versione: `https://parresbo.laruffa.dev/privacy` deve rispondere (è l'URL dell'informativa privacy richiesto da Play).
- Controllare nelle Impostazioni dell'app: versione e "✓ Aggiornata".

## Play Console
1. **Crea app** → nome *ParResBo*, lingua italiano, app (non gioco), gratuita.
2. **Scheda dello store** (screenshot del telefono già pronti in `store/screenshots/`, 1080×1920: Google accetta al massimo 2:1 e quelli grezzi del telefono erano 1080×2392; rigenerarli con `scripts/store-screenshots.sh`): screenshot di Android Auto in `store/screenshots-auto/` (1920×1080, da `scripts/store-screenshots-auto.sh`; il SÌ e il NO! vanno rifatti con la versione corrente dell'app, che non tronca più il testo), icona 512 (`store/icon-512.png`), immagine di presentazione 1024×500 (`store/feature-graphic-1024x500.png`), descrizioni, almeno 2 screenshot del telefono. Per Android Auto servono anche gli screenshot dell'auto (si ottengono con il Desktop Head Unit).
3. **Contenuti dell'app**:
   - Informativa privacy: `https://parresbo.laruffa.dev/privacy`
   - Annunci: no · Accesso all'app: nessun login · Pubblico: 13+ (non per bambini, patentino AM dai 14 anni) · App governativa: no (non è ufficiale)
   - Classificazione dei contenuti: questionario IARC, tutte "no" → classificazione bassa
   - **Sicurezza dei dati**: la posizione è usata solo sul dispositivo e non viene inviata a nessuno → non "raccolta". Nessun dato condiviso, nessun account, i dati locali (zona scelta) restano sul dispositivo. Dichiarare che il server può vedere l'IP come ogni sito è facoltativo (log di rete, non raccolti dall'app).
   - Permessi: posizione (precisa) solo in primo piano, per rispondere a "Posso parcheggiare qui?".
4. **Release → Test interno** (o chiuso): caricare `parresbo-1.0-release.aab`. Con "Play App Signing" attivo Google riceve la chiave di firma; tu conservi la chiave di upload.
5. **Android Auto**: Impostazioni avanzate → **Form factor** → *Aggiungi form factor* → **Android Auto**, poi rilasciare l'AAB in un track di test. La revisione delle linee guida auto: nessuna su test interno, non bloccante su test chiuso, **bloccante su test aperto e produzione**. L'esito arriva per email.
6. **Account personale**: se il tuo account sviluppatore è personale (non di organizzazione) e recente, Google può richiedere un **test chiuso con almeno 12 tester per 14 giorni consecutivi** prima di poter chiedere l'accesso alla produzione. Verificare nella Console.

## Istruzioni per i revisori (campo "Accesso all'app" / note)
> L'app serve per le zone di sosta residenti di **Bologna (Italia)**: fuori da Bologna risponde "Sei fuori zona".
> Per provarla impostare una posizione simulata (app "mock GPS") a **44.4949, 11.3426** (Via Indipendenza, zone 1, 4, 5).
> Nell'app: Impostazioni → "La mia zona" → scegliere ad esempio *Zona 4* → "Posso parcheggiare qui?" → SÌ; scegliendo *Zona A* → NO!.
> Su Android Auto: la prima volta compare l'avviso, poi "Scegli la zona" e la risposta con la posizione del telefono.
> Non servono credenziali.

## Dopo la pubblicazione
- Con "Play App Signing" l'app installata dallo store è firmata da Google: **un APK di upload non si installa sopra** (disinstallare prima).
- Per aggiornare: aumentare `versionCode`, ricompilare, caricare il nuovo AAB.

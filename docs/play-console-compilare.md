# Play Console: cosa scrivere, campo per campo

Testi pronti da incollare. Lunghezze rispettano i limiti di Play. Le immagini sono in `store/`, i pacchetti in `dist/`.

## 1. Release (test interno / chiuso / produzione)

**Nome della release** (solo interno, nessun utente lo vede): `parresbo-1-0` va benissimo. Play propone di default "1 (1.0)", puoi tenere quello.

**Note di rilascio** (max 500 caratteri per lingua). Incolla dentro il blocco `<it-IT>`:

```
Prima versione di ParResBo.
• Mappa delle zone di sosta riservate ai residenti di Bologna
• "Posso parcheggiare qui?": SÌ, NO! o "?" in base alla tua posizione e alla tua zona
• Se è NO!, ti propone il parcheggio più vicino e apre la navigazione
• Versione per Android Auto
• Funziona anche con connessione lenta o assente
Fa sempre fede la segnaletica stradale.
```

## 2. Scheda dello store (italiano)

**Nome app** (max 30): `ParResBo`

**Breve descrizione** (max 80):
```
Posso parcheggiare qui? Le zone residenti di Bologna, con risposta SÌ o NO!
```

**Descrizione completa** (max 4000):
```
APP NON UFFICIALE: ParResBo non è un'app del Comune di Bologna né di alcun ente governativo e non rappresenta nessuna pubblica amministrazione. È un progetto personale e indipendente.

ParResBo (Parcheggio Residenti Bologna) risponde a una domanda sola: posso parcheggiare qui?

Scegli la tua zona di residenza, tocca "Posso parcheggiare qui?" e l'app ti dice in grande SÌ oppure NO! in base a dove ti trovi. Se la risposta è NO!, ti propone il parcheggio più vicino riservato alla tua zona e avvia la navigazione con l'app di mappe che preferisci. Se sei lontano da qualsiasi zona, te lo dice senza inventare risposte.

• Mappa di tutte le zone residenti di Bologna, con le strade colorate per zona
• Le strade che appartengono a più zone sono tratteggiate
• Puoi mostrare tutte le zone o solo la tua
• Risposta grande e leggibile, che si chiude da sola dopo pochi secondi
• Funziona anche con connessione lenta o assente (ad esempio in treno), con i dati già scaricati
• Versione per Android Auto: scegli la zona e controlla la sosta direttamente dallo schermo dell'auto
• Nessun account, nessuna pubblicità, nessun tracciamento

PRIVACY
La tua posizione resta sul tuo dispositivo: serve solo a trovare la strada più vicina e non viene inviata a nessuno.

AVVISO IMPORTANTE
ParResBo non è un'app ufficiale e non ha alcun legame con il Comune di Bologna. I dati possono essere incompleti o non aggiornati e il GPS può sbagliare: le risposte sono solo un aiuto e fa sempre fede la segnaletica stradale. L'autore non risponde di eventuali sanzioni. Non usare l'app mentre guidi.

FONTI DEI DATI
Le informazioni sulle zone e sulle strade provengono dalle fonti ufficiali del Comune di Bologna, dati aperti con licenza CC BY 4.0, elaborati da ParResBo:
• Portale open data: https://opendata.comune.bologna.it
• Dataset "Stradario generale": https://opendata.comune.bologna.it/explore/dataset/stradario-generale-al-25nov2022/
Per le regole di sosta ufficiali consulta il sito del Comune di Bologna: https://www.comune.bologna.it
Mappa e tracciati delle strade: © OpenStreetMap contributors (https://www.openstreetmap.org/copyright).
```

**Grafica**
- Icona: `store/icon-512.png`
- Immagine di presentazione: `store/feature-graphic-1024x500.png`
- Screenshot telefono: `store/screenshots/*.png` (1080×1920)
- Screenshot Android Auto (se te li chiede come tablet/auto/altro): `store/screenshots-auto/*.png` (1920×1080)

**Categoria**: Mappe e navigazione (in alternativa: Auto e veicoli). **Tag**: parcheggio, mappe.
**Contatti**: email di contatto pubblica (obbligatoria, usa una che non ti dispiace mostrare), sito web `https://parresbo.laruffa.dev`.

## 3. Contenuti dell'app

| Voce | Risposta |
|---|---|
| Informativa privacy | `https://parresbo.laruffa.dev/privacy` |
| Annunci | No |
| Accesso all'app | Nessun login; incolla le istruzioni per i revisori qui sotto |
| Pubblico di destinazione | 13-15, 16-17 e 18+ (patentino AM dai 14 anni); NON le fasce sotto i 13 |
| App governativa | No |
| App di notizie | No |
| Funzioni finanziarie, salute, VPN | No a tutto |
| Classificazione IARC | Categoria "Utility/Riferimento"; tutte le domande "No" |
| ID pubblicità | No, l'app non lo usa |

**Istruzioni per i revisori** (campo "Accesso all'app"):
```
L'app serve per le zone di sosta residenti di Bologna (Italia): fuori da Bologna risponde "Sei fuori zona".
Per provarla impostare una posizione simulata (app "mock GPS") a 44.4949, 11.3426 (Via Indipendenza, zone 1, 4, 5).
Nell'app: Impostazioni → "La mia zona" → scegliere ad esempio Zona 4 → "Posso parcheggiare qui?" → SÌ; scegliendo Zona A → NO!.
Su Android Auto: la prima volta compare l'avviso, poi "Scegli la zona" e la risposta con la posizione del telefono.
Non servono credenziali.
```

## 4. Sicurezza dei dati

- L'app raccoglie o condivide dati utente? **No** (la posizione è elaborata solo sul dispositivo e non lascia il telefono).
- Se Play insiste a elencare la posizione: "Posizione precisa" → *elaborata solo in locale / non raccolta*, nessuna condivisione, facoltativa.
- Crittografia in transito: **Sì** (HTTPS).
- Richiesta di eliminazione dati: non applicabile (nessun account).

## 5. Permessi e dichiarazioni

- **Posizione**: `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION`, solo in primo piano. Motivazione: "Trovare la strada più vicina alla posizione dell'utente per dire se può parcheggiare. Elaborata sul dispositivo."
- Nessuna posizione in background, nessun servizio in primo piano.

## 6. Android Auto

Impostazioni avanzate → Form factor → Aggiungi → **Android Auto**. Categoria dell'app auto: **Punti di interesse** (nel manifest `androidx.car.app.category.POI`; PARKING è deprecata). L'AAB è lo stesso. La revisione auto è bloccante solo su test aperto e produzione.

## 7. Account personale nuovo

Se la Console te lo chiede: test chiuso con almeno 12 tester per 14 giorni consecutivi prima di poter chiedere la produzione. Raccogli le email dei tester (devono essere iscritti al gruppo/lista che crei).

## 8. Dopo ogni caricamento

- Aumenta `versionCode` in `android/app/build.gradle` e ricompila (`docs/play-store.md`).
- L'app scaricata dallo store è firmata da Google: un APK di upload non si installa sopra, disinstalla prima.
- Backup di `~/.config/parresbo-signing/` (chiave di upload).

---

Se Play ti chiede altro, incollami la domanda e la aggiungo qui sotto.

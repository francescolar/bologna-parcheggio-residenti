'use strict';

const crypto      = require('crypto');
const express     = require('express');
const compression = require('compression');
const fs       = require('fs');
const path     = require('path');

const app = express();

const BOLOGNA_API  = 'https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/stradario-generale-al-25nov2022/records';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
// Overpass chiede di identificarsi: impostare OVERPASS_CONTACT (email o URL) in produzione
const OVERPASS_USER_AGENT = `parresbo/1.0 (${process.env.OVERPASS_CONTACT ?? 'https://github.com/francescolar/bologna-parcheggio-residenti'})`;
const CACHE_DIR    = path.join(__dirname, 'cache');
const CACHE_FILE   = path.join(CACHE_DIR, 'osm-ways.json');
const CACHE_META   = path.join(CACHE_DIR, 'osm-ways.meta.json');
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const CACHE_VERSION = 5; // incrementa se cambia la query Overpass

// ── STREET TYPE MAP ──────────────────────────────────────────────────────────
const STREET_TYPES = {
  VIA:'Via', VIALE:'Viale', PIAZZA:'Piazza', CORSO:'Corso',
  VICOLO:'Vicolo', STRADA:'Strada', LARGO:'Largo',
  SCALINATA:'Scalinata', RAMPA:'Rampa', PASSAGGIO:'Passaggio',
  GALLERIA:'Galleria', ROTONDA:'Rotonda', PORTICO:'Portico',
  PONTE:'Ponte', SOTTOPASSO:'Sottopasso', PIAZZALE:'Piazzale',
  PIAZZETTA:'Piazzetta', STRADELLO:'Stradello', TRAVERSA:'Traversa',
  CAVALCAVIA:'Cavalcavia', LUNGOFIUME:'Lungofiume',
  'VIA PRIVATA':'Via Privata', 'STRADA PRIVATA':'Strada Privata',
};

// Tipi composti: il tipo include una preposizione che si attacca al nome
// sep='' → nessuno spazio tra tipo e nome (apostrofo), sep=' ' → spazio normale
const COMPOUND_TYPES = {
  "VIA DELL'":      { str: "Via dell'",    sep: '' },
  "VIA DE'":        { str: "Via de'",      sep: '' },
  "VIA DEL":        { str: "Via del",      sep: ' ' },
  "VIA DELLA":      { str: "Via della",    sep: ' ' },
  "VIA DELLE":      { str: "Via delle",    sep: ' ' },
  "VIA DEGLI":      { str: "Via degli",    sep: ' ' },
  "VIA DEI":        { str: "Via dei",      sep: ' ' },
  "VIALE DEL":      { str: "Viale del",    sep: ' ' },
  "VIALE DELLA":    { str: "Viale della",  sep: ' ' },
  "VIALE DELL'":    { str: "Viale dell'",  sep: '' },
  "PIAZZA DEL":     { str: "Piazza del",   sep: ' ' },
  "PIAZZA DELLA":   { str: "Piazza della", sep: ' ' },
  "PIAZZA DELL'":   { str: "Piazza dell'", sep: '' },
  "CORSO DEL":      { str: "Corso del",    sep: ' ' },
  "STRADA DEL":     { str: "Strada del",   sep: ' ' },
  "STRADA DELLA":   { str: "Strada della", sep: ' ' },
  "LARGO DEL":      { str: "Largo del",      sep: ' ' },
  "LARGO DELLA":    { str: "Largo della",    sep: ' ' },
  "MURA DI PORTA":  { str: "Mura di Porta",  sep: ' ' },
  "PIAZZA DI PORTA":{ str: "Piazza di Porta",sep: ' ' },
  "VOLTONE":        { str: "Voltone",         sep: ' ' },
  "VOLTONE DEL":    { str: "Voltone del",     sep: ' ' },
  "LOCALITA'":      { str: "Via",             sep: ' ' },
};

// Numeri scritti in lettere → cifre (per DUE AGOSTO → "2 Agosto" in OSM)
const NUM_WORDS = {
  'UNO':'1','DUE':'2','TRE':'3','QUATTRO':'4','CINQUE':'5','SEI':'6',
  'SETTE':'7','OTTO':'8','NOVE':'9','DIECI':'10','UNDICI':'11','DODICI':'12',
  'TREDICI':'13','QUATTORDICI':'14','QUINDICI':'15','SEDICI':'16',
  'DICIASSETTE':'17','DICIOTTO':'18','DICIANNOVE':'19','VENTI':'20',
  'VENTUNO':'21','VENTIDUE':'22','VENTITRE':'23','VENTIQUATTRO':'24',
};

// Correzioni esplicite per nomi troncati o abbreviati in modo non deducibile
// Chiave: descr Bologna esatta (es. "BENEDETTO QUATTOR.(VIA)")
// Valore: nome OSM esatto
const CORRECTIONS = {
  'BENEDETTO QUATTOR.(VIA)': 'Via Benedetto XIV',
};

// ── NORMALIZZAZIONE NOMI ─────────────────────────────────────────────────────
function titleCase(s) {
  // Preserva minuscolo per preposizioni italiane comuni
  const LOWER = new Set(['di','del','della','delle','degli','dei','de','d','dal','dalla','al','alla','il','la','lo','le','gli','i','in','a','da','su','per','con','tra','fra','e','o']);
  return s.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && LOWER.has(w.replace(/'/g, ''))) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function normalizeKey(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // rimuovi accenti
    .replace(/[''`‘’]/g, "'")               // normalizza apostrofi tipografici
    .replace(/'(?=\s|$)/g, '')                         // apostrofo finale = accento mancante (LIBERTA' → liberta)
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCandidates(descr) {
  const m = descr.match(/^(.+?)\((.+?)\)$/);
  if (!m) return { candidates: [descr], namePart: descr, typeNorm: '' };

  let rawName = m[1].trim();
  const rawType = m[2].trim();

  // ── Preprocess rawName ───────────────────────────────────────────────────
  // 1. Togli abbreviazione finale tipo " M." o " P." (es. "PORTA CASTIGLIONE M.")
  rawName = rawName.replace(/\s+[A-Z]\.$/, '').trim();
  // 2. Togli parola finale uguale al tipo principale (es. "BARACCANO PIAZZA" → "BARACCANO")
  const typeFirstWord = rawType.split(' ')[0];
  if (rawName.toUpperCase().endsWith(' ' + typeFirstWord)) {
    rawName = rawName.slice(0, -(typeFirstWord.length + 1)).trim();
  }
  // 3. Per MURA/PIAZZA DI PORTA: il rawName inizia con "PORTA " che fa parte del tipo
  if (rawType === 'MURA DI PORTA' || rawType === 'PIAZZA DI PORTA') {
    rawName = rawName.replace(/^PORTA\s+/i, '').trim();
  }

  // ── Tipo ─────────────────────────────────────────────────────────────────
  let typeStr, sep;
  if (COMPOUND_TYPES[rawType]) {
    ({ str: typeStr, sep } = COMPOUND_TYPES[rawType]);
  } else if (STREET_TYPES[rawType]) {
    typeStr = STREET_TYPES[rawType];
    sep = ' ';
  } else if (rawType.endsWith("'")) {
    typeStr = titleCase(rawType.slice(0, -1)) + "'";
    sep = '';
  } else {
    typeStr = titleCase(rawType);
    sep = ' ';
  }

  const nameTC     = titleCase(rawName);
  const c1         = `${typeStr}${sep}${nameTC}`;
  const candidates = [c1];

  // Prova ordine inverso (COGNOME NOME → Nome Cognome)
  const words = rawName.split(/\s+/);
  if (words.length >= 2) {
    const rev = words.slice().reverse().map(titleCase).join(' ');
    if (rev !== nameTC) candidates.push(`${typeStr}${sep}${rev}`);
  }

  // Per MURA DI PORTA: OSM a volte usa "Via Mura di Porta X"
  if (rawType === 'MURA DI PORTA') {
    candidates.push(`Via Mura di Porta ${nameTC}`);
  }

  // Per nomi di una sola parola: prova con preposizioni italiane
  // (es. "ARTIGIANO" → "Via dell'Artigiano", "Via del Artigiano" ecc.)
  if (words.length === 1 && !rawName.includes("'")) {
    candidates.push(`${typeStr} dell'${nameTC}`);
    candidates.push(`${typeStr} del ${nameTC}`);
    candidates.push(`${typeStr} della ${nameTC}`);
  }

  // Fallback tipo: PIAZZETTA → prova anche con Piazza
  if (rawType === 'PIAZZETTA') {
    candidates.push(`Piazza ${nameTC}`);
    if (words.length >= 2) {
      const rev = words.slice().reverse().map(titleCase).join(' ');
      if (rev !== nameTC) candidates.push(`Piazza ${rev}`);
    }
    candidates.push(`Piazza dell'${nameTC}`);
    candidates.push(`Piazza del ${nameTC}`);
  }

  // Versione con numeri in cifre (es. "DUE AGOSTO" → "2 Agosto")
  const withDigits = rawName.split(/\s+/)
    .map(w => NUM_WORDS[w.toUpperCase()] ?? titleCase(w)).join(' ');
  if (withDigits !== nameTC) {
    candidates.push(`${typeStr}${sep}${withDigits}`);
    // Anche ordine inverso con cifre
    const withDigitsRev = rawName.split(/\s+/).reverse()
      .map(w => NUM_WORDS[w.toUpperCase()] ?? titleCase(w)).join(' ');
    if (withDigitsRev !== withDigits) candidates.push(`${typeStr}${sep}${withDigitsRev}`);
  }

  // "Montesole" → "Monte Sole" (fusioni di parole comuni)
  const joined = rawName.replace(/\s+/g, '').toUpperCase();
  const FUSED_WORDS = { 'MONTESOLE': 'Monte Sole', 'SETTENBRE': 'Settembre' };
  for (const [fused, expanded] of Object.entries(FUSED_WORDS)) {
    if (joined.includes(fused)) {
      const expanded_name = nameTC.replace(new RegExp(fused, 'i'), expanded);
      if (expanded_name !== nameTC) candidates.push(`${typeStr}${sep}${expanded_name}`);
    }
  }

  // Correzione esplicita: aggiunge il nome OSM noto in cima ai candidati
  if (CORRECTIONS[descr]) candidates.unshift(CORRECTIONS[descr]);

  return {
    candidates,
    namePart: nameTC,
    nameWords: normalizeKey(nameTC).replace(/\.$/, '').split(/\s+/).filter(w => w.length >= 3),
    typeNorm: normalizeKey(typeStr.split(' ')[0]),
    rawTypeNorm: normalizeKey(typeStr.split(' ')[0]), // per fallback tipo
    altTypeNorm: rawType === 'PIAZZETTA' ? 'piazza' : null, // fallback tipo
  };
}

// ── FETCH BOLOGNA API ────────────────────────────────────────────────────────
async function fetchAllBolognaStreets() {
  const limit = 100;
  let offset = 0, total = null;
  const all = [];
  do {
    const r = await fetch(`${BOLOGNA_API}?limit=${limit}&offset=${offset}`);
    if (!r.ok) throw new Error(`Bologna API HTTP ${r.status}`);
    const d = await r.json();
    if (total === null) total = d.total_count;
    all.push(...d.results);
    offset += limit;
    process.stdout.write(`\r  Bologna API: ${all.length}/${total}`);
  } while (all.length < total);
  console.log();
  return all;
}

// ── FETCH OVERPASS (con cache su disco) ──────────────────────────────────────
async function overpassFetch(query, label) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`  Overpass [${label}]: provo ${endpoint}`);
    const body = new URLSearchParams({ data: query });
    const r = await fetch(endpoint, {
      method: 'POST', body,
      headers: { 'User-Agent': OVERPASS_USER_AGENT },
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn(`  Overpass ${r.status} da ${endpoint}: ${txt.slice(0, 120)}`);
      continue;
    }
    const d = await r.json();
    return d.elements ?? [];
  }
  throw new Error(`Tutti gli endpoint Overpass hanno fallito (${label})`);
}

async function fetchOSMWays() {
  if (fs.existsSync(CACHE_FILE) && fs.existsSync(CACHE_META)) {
    const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
    if (meta.version === CACHE_VERSION && Date.now() - meta.ts < CACHE_TTL_MS) {
      console.log('  Overpass: uso cache su disco');
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
    console.log('  Overpass: cache scaduta o versione cambiata, riscario…');
  }

  console.log('  Overpass: scarico geometrie strade Bologna…');

  // Fetch 1: way con highway o place=square (geometria inline tramite "out geom")
  const queryWays = `
[out:json][timeout:180];
area["name"="Bologna"]["admin_level"="8"]->.bo;
(
  way["highway"]["name"](area.bo);
  way["place"="square"]["name"](area.bo);
);
out geom;
`;
  const ways = await overpassFetch(queryWays, 'ways');

  // Piccola pausa per non colpire lo stesso endpoint Overpass in rapida successione
  await new Promise(r => setTimeout(r, 3000));

  // Fetch 2: relation con place=square — query SEPARATA per non rompere la geometria dei way
  // Con "out geom" le relation ricevono la geometria nei membri (members[].geometry)
  const queryRels = `
[out:json][timeout:60];
area["name"="Bologna"]["admin_level"="8"]->.bo;
relation["place"="square"]["name"](area.bo);
out geom;
`;
  const relElements = await overpassFetch(queryRels, 'relations');

  // Converti relation in pseudo-way: raccogli tutta la geometria dai membri
  const relWays = relElements
    .filter(el => el.type === 'relation' && el.tags?.name)
    .map(el => {
      const geometry = (el.members ?? []).flatMap(m => m.geometry ?? []);
      if (!geometry.length) return null;
      return { type: 'way', id: el.id, tags: el.tags, geometry };
    })
    .filter(Boolean);

  console.log(`  Overpass: ${ways.length} way + ${relWays.length} relation-piazze`);
  const combined = [...ways, ...relWays];

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(combined));
  fs.writeFileSync(CACHE_META, JSON.stringify({ ts: Date.now(), count: combined.length, version: CACHE_VERSION }));
  console.log(`  Overpass: ${combined.length} elementi salvati in cache`);
  return combined;
}

// ── MERGE E MATCHING ─────────────────────────────────────────────────────────
function processStreets(records, osmWays) {
  // Raggruppa record Bologna per codice via
  const streets = new Map();
  for (const r of records) {
    if (!streets.has(r.via)) {
      streets.set(r.via, {
        via: r.via,
        descr: r.descr,
        zones: [],
        ...parseCandidates(r.descr),  // candidates, namePart, typeNorm
      });
    }
    const s = streets.get(r.via);
    if (r.zona && !s.zones.includes(r.zona)) s.zones.push(r.zona);
  }

  // Indice OSM: nome esatto, normalizzato, suffisso, e lista piatta per LIKE
  const osmExact     = new Map(); // nome esatto → [ways]
  const osmNorm      = new Map(); // nome normalizzato → [ways]
  const osmSuffixIdx = new Map(); // "typeNorm:lastWord" → [{ nameNorm, name, ways }]
  const osmAllNorm   = [];        // [{ typeNorm, nameNorm, name, ways }] per LIKE

  for (const w of osmWays) {
    const name = w.tags?.name;
    if (!name || !w.geometry?.length) continue;

    if (!osmExact.has(name)) osmExact.set(name, []);
    osmExact.get(name).push(w);

    const key = normalizeKey(name);
    if (!osmNorm.has(key)) osmNorm.set(key, []);
    osmNorm.get(key).push(w);

    const keyWords = key.split(' ');
    if (keyWords.length >= 2) {
      const typeFirst = keyWords[0];
      const lastWord  = keyWords[keyWords.length - 1];

      const addSuffix = (sfxKey) => {
        if (!osmSuffixIdx.has(sfxKey)) osmSuffixIdx.set(sfxKey, []);
        osmSuffixIdx.get(sfxKey).push({ nameNorm: key, name, ways: [w] });
      };

      addSuffix(`${typeFirst}:${lastWord}`);
      // Anche la parte dopo l'apostrofo ("dell'artigiano" → indicizza "artigiano" separatamente)
      const lastWordAfterApos = lastWord.split("'").pop();
      if (lastWordAfterApos !== lastWord) addSuffix(`${typeFirst}:${lastWordAfterApos}`);

      // Per LIKE: aggiungi solo una volta per nome univoco
      if (!osmNorm.has(key) || osmNorm.get(key).length === 1) {
        osmAllNorm.push({ typeNorm: typeFirst, nameNorm: key, name, ways: osmExact.get(name) });
      }
    }
  }

  // Deduplica osmAllNorm per nome
  const osmAllNormUniq = [...new Map(osmAllNorm.map(e => [e.name, e])).values()];

  // Matching
  let matched = 0;
  const result = [];

  for (const s of streets.values()) {
    let foundWays = null;
    let matchedName = null;

    // Strategia 1: match esatto o normalizzato sui candidati generati
    for (const c of s.candidates) {
      if (osmExact.has(c)) {
        foundWays   = osmExact.get(c);
        matchedName = c;
        break;
      }
      const key = normalizeKey(c);
      if (osmNorm.has(key)) {
        foundWays   = osmNorm.get(key);
        matchedName = c;
        break;
      }
    }

    // Strategia 2: suffix match — Bologna ha "MARCONI(VIA)", OSM ha "Via Guglielmo Marconi"
    if (!foundWays && s.typeNorm && s.namePart) {
      const nameNorm = normalizeKey(s.namePart);
      const words    = nameNorm.split(' ');
      const lastWord = words[words.length - 1];
      const sfxKey   = `${s.typeNorm}:${lastWord}`;
      const hits     = osmSuffixIdx.get(sfxKey) ?? [];

      const hit = hits.find(h => h.nameNorm.endsWith(' ' + nameNorm) || h.nameNorm === nameNorm);
      if (hit) {
        foundWays   = osmExact.get(hit.name) ?? hit.ways;
        matchedName = hit.name + ' [suffix]';
      } else if (hits.length === 1) {
        foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
        matchedName = hits[0].name + ' [suffix-unique]';
      }
    }

    // Strategia 3: LIKE — sottostringa diretta (per nomi troncati)
    // Prova anche con altTypeNorm (es. PIAZZETTA → PIAZZA) per tipo OSM diverso
    if (!foundWays && s.namePart) {
      const needle = normalizeKey(s.namePart).replace(/\.$/, '').trim();
      if (needle.length >= 4) {
        const tryLike = (typeN) => osmAllNormUniq.filter(e =>
          e.typeNorm === typeN && e.nameNorm.includes(needle)
        );
        let hits = s.typeNorm ? tryLike(s.typeNorm) : [];
        if (!hits.length && s.altTypeNorm) hits = tryLike(s.altTypeNorm);
        if (hits.length === 1) {
          foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
          matchedName = hits[0].name + ' [like]';
        }
      }
    }

    // Strategia 4: tutte le parole presenti nel nome OSM (ordine qualsiasi)
    // Include soft-match per typo (es. "Giambattista" ≈ "Gianbattista", "Govanni" ≈ "Giovanni")
    if (!foundWays && s.typeNorm && s.nameWords?.length >= 2) {
      const softContains = (hay, needle) => {
        if (hay.includes(needle)) return true;
        const words = hay.split(' ');
        // Tolera 1 char diverso all'inizio (es. "govanni" ↔ "giovanni")
        if (needle.length >= 6) {
          const suf1 = needle.slice(-Math.max(5, needle.length - 1));
          if (words.some(w => w.endsWith(suf1))) return true;
        }
        // Tolera differenze nei primi 4 char (es. "giambattista" ↔ "gianbattista")
        if (needle.length >= 8) {
          const suf4 = needle.slice(-(needle.length - 4));
          if (words.some(w => w.endsWith(suf4))) return true;
        }
        return false;
      };
      const tryType = (typeN) => osmAllNormUniq.filter(e =>
        e.typeNorm === typeN && s.nameWords.every(w => softContains(e.nameNorm, w))
      );
      let hits = tryType(s.typeNorm);
      // Fallback tipo (es. PIAZZETTA → PIAZZA)
      if (!hits.length && s.altTypeNorm) hits = tryType(s.altTypeNorm);
      if (hits.length === 1) {
        foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
        matchedName = hits[0].name + ' [all-words]';
      }
    }

    // Strategia 5: candidate è prefisso del nome OSM (es. "Galleria 2 Agosto" ⊂ "Galleria 2 Agosto 1980")
    // Se ambiguo (es. "Via Dante" → Alighieri e Benazzi) prende quella con più segmenti OSM
    if (!foundWays) {
      for (const c of s.candidates) {
        const cNorm = normalizeKey(c);
        if (cNorm.length < 6) continue;
        const hits = osmAllNormUniq.filter(e =>
          e.nameNorm === cNorm || e.nameNorm.startsWith(cNorm + ' ')
        );
        if (hits.length === 1) {
          foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
          matchedName = hits[0].name + ' [starts-with]';
          break;
        } else if (hits.length > 1) {
          hits.sort((a, b) => (osmExact.get(b.name)?.length ?? 0) - (osmExact.get(a.name)?.length ?? 0));
          foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
          matchedName = hits[0].name + ' [starts-with-prominent]';
          break;
        }
      }
    }

    // Strategia 7: suffix con più risultati → prendi la via con più segmenti OSM
    if (!foundWays && s.typeNorm && s.namePart) {
      const nameNorm = normalizeKey(s.namePart);
      const words    = nameNorm.split(' ');
      const lastWord = words[words.length - 1];
      const hits     = [...(osmSuffixIdx.get(`${s.typeNorm}:${lastWord}`) ?? []),
                        ...(osmSuffixIdx.get(`${s.typeNorm}:${lastWord.split("'").pop()}`) ?? [])]
        .filter((v, i, a) => a.findIndex(x => x.name === v.name) === i); // deduplica
      if (hits.length > 1) {
        // Prendi quella con più segmenti OSM (strada più prominente)
        hits.sort((a, b) => (osmExact.get(b.name)?.length ?? 0) - (osmExact.get(a.name)?.length ?? 0));
        foundWays   = osmExact.get(hits[0].name) ?? hits[0].ways;
        matchedName = hits[0].name + ' [suffix-prominent]';
      }
    }

    if (foundWays) matched++;

    const zones = s.zones.sort();
    const zone  = zones.length === 1 ? zones[0] : 'MISTA';

    result.push({
      via: s.via,
      descr: s.descr,
      label: s.candidates[0], // nome leggibile (es. "Via Oberdan"), per l'interfaccia
      zones,
      zone,
      matched: !!foundWays,
      matchedName,
      polylines: foundWays
        ? foundWays.map(w => w.geometry.map(p => [p.lat, p.lon]))
        : [],
    });
  }

  const total = streets.size;
  console.log(`  Match: ${matched}/${total} (${Math.round(100 * matched / total)}%)`);
  return { streets: result, stats: { matched, total } };
}

// ── CACHE IN-MEMORY ──────────────────────────────────────────────────────────
let memCache = null;
let loadingPromise = null; // evita fetch multipli concorrenti

async function getData() {
  if (memCache) return memCache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    console.log('Caricamento dati…');
    const [records, osmWays] = await Promise.all([
      fetchAllBolognaStreets(),
      fetchOSMWays(),
    ]);
    memCache = processStreets(records, osmWays);
    return memCache;
  })();
  // Se il caricamento fallisce si deve poter riprovare alla richiesta successiva
  loadingPromise.catch(() => { loadingPromise = null; });
  return loadingPromise;
}

// ── SERVER ───────────────────────────────────────────────────────────────────
app.use(compression());

// Leaflet servito in locale (niente CDN → l'app funziona anche offline via service worker)
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));

// ── VERSIONE DEL FRONTEND ────────────────────────────────────────────────────
// BUILD_ID = hash del contenuto di public/: cambia da solo a ogni deploy che modifica i file.
// Serve a invalidare le cache: gli URL di JS/CSS nell'HTML e la cache del service worker lo contengono,
// quindi Cloudflare, il browser o la WebView non possono servire file vecchi (Cloudflare porta
// il Cache-Control di JS/CSS a 4 ore, ignorando quello dell'origine).
const PUBLIC_DIR = path.join(__dirname, 'public');
function computeBuild() {
  const h = crypto.createHash('sha1');
  let newest = 0;
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else { h.update(path.relative(PUBLIC_DIR, p)); h.update(fs.readFileSync(p)); newest = Math.max(newest, fs.statSync(p).mtimeMs); }
    }
  };
  walk(PUBLIC_DIR);
  // builtAt = file più recente di public/: nel container è l'orario del deploy (git clone + COPY)
  return { id: h.digest('hex').slice(0, 10), builtAt: new Date(newest).toISOString() };
}
const { id: BUILD_ID, builtAt: BUILT_AT } = computeBuild();

const withBuildId = file => fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8').replaceAll('__BUILD_ID__', BUILD_ID).replaceAll('__BUILD_TIME__', BUILT_AT);
const INDEX_HTML = withBuildId('index.html');
const SW_JS      = withBuildId('sw.js');

app.get('/version.json', (req, res) => res.set('Cache-Control', 'no-store').json({ build: BUILD_ID, builtAt: BUILT_AT }));
app.get(['/', '/index.html'], (req, res) =>
  res.set('Cache-Control', 'no-cache').type('html').send(INDEX_HTML));
app.get('/sw.js', (req, res) =>
  res.set('Cache-Control', 'no-cache').type('application/javascript').send(SW_JS));

app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, file) {
    // Codice dell'app: sempre da riconvalidare (ETag). Il resto (icone) può stare in cache.
    if (/\.(html|js|css|webmanifest)$/.test(file)) res.set('Cache-Control', 'no-cache');
  },
}));

// Healthcheck: risponde subito anche mentre i dati sono ancora in caricamento
app.get('/healthz', (req, res) => res.json({ ok: true, ready: !!memCache, build: BUILD_ID }));

// ── DEBUG: sblocco con password ──────────────────────────────────────────────
// La password sta nella variabile d'ambiente DEBUG_PASSWORD (Coolify). Se non è impostata il debug
// è disattivato. Il server verifica solo la password: la funzione (posizione simulata) è tutta
// nel client, quindi è un blocco di comodo dell'interfaccia, non una protezione di dati.
const debugAttempts = [];                 // istanti dei tentativi nell'ultimo minuto
app.post('/api/debug/unlock', express.json({ limit: '1kb' }), (req, res) => {
  const expected = process.env.DEBUG_PASSWORD;
  if (!expected) return res.status(404).json({ error: 'Debug non abilitato su questo server' });

  const now = Date.now();
  while (debugAttempts.length && now - debugAttempts[0] > 60_000) debugAttempts.shift();
  if (debugAttempts.length >= 10) return res.status(429).set('Retry-After', '60').json({ error: 'Troppi tentativi, riprova tra un minuto' });
  debugAttempts.push(now);

  const digest = v => crypto.createHash('sha256').update(String(v ?? '')).digest();
  if (!crypto.timingSafeEqual(digest(req.body?.password), digest(expected))) {
    return res.status(401).json({ error: 'Password errata' });
  }
  res.json({ ok: true });
});

app.get('/api/streets', async (req, res) => {
  if (!memCache) {
    // Il primo caricamento (Overpass) può durare minuti: non tenere la richiesta aperta
    // (i reverse proxy andrebbero in timeout), il client riprova.
    getData().catch(err => console.error('Caricamento dati fallito:', err.message));
    return res.status(503).set('Retry-After', '5').json({ loading: true });
  }
  res.set('Cache-Control', 'no-cache').json(memCache);
});

const PORT = process.env.PORT ?? 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nServer avviato → http://localhost:${PORT}\n`);
    // Precarica i dati all'avvio
    getData().catch(err => console.error('Caricamento dati fallito:', err.message));
  });
}

module.exports = {
  app, BUILD_ID, normalizeKey, titleCase, parseCandidates, processStreets,
  _setCache: data => { memCache = data; },
  _resetDebugAttempts: () => { debugAttempts.length = 0; },
};

'use strict';

// ── COLORI ZONE ──────────────────────────────────────────────────────────────
const ZONE_COLORS = {
  '1': '#ef4444', '2': '#f97316', '3': '#eab308',
  '4': '#22c55e', '5': '#06b6d4',
  'A': '#3b82f6', 'B': '#8b5cf6', 'C': '#ec4899',
  'D': '#14b8a6', 'E': '#84cc16', 'F': '#f59e0b',
  'I': '#6366f1', 'L': '#0ea5e9', 'M': '#d946ef',
  'P': '#10b981', 'Q': '#f43f5e', 'UNI': '#7c3aed',
  'Z': '#78716c', 'MISTA': '#94a3b8',
};
function zoneColor(z) { return ZONE_COLORS[z] ?? '#64748b'; }

const $ = id => document.getElementById(id);
const streetLabel = s => s.label ?? s.descr;

// Niente menu contestuale / selezione con pressione prolungata (comportamento da app)
document.addEventListener('contextmenu', e => e.preventDefault());

// ── STATE ────────────────────────────────────────────────────────────────────
let allStreets = [];
let myZone     = localStorage.getItem('myZone') || '';
let hiddenZones = new Set(JSON.parse(localStorage.getItem('hiddenZones') || '[]'));

const zoneLayers    = {};  // zone → L.layerGroup
const zonePolylines = {};  // zone → [L.polyline]
const streetPolylines = []; // [{ pl, zones }] per evidenziare la mia zona
const DASH = 14;            // lunghezza dei tratti (px) per le vie a più zone
const polylineStyle = mine => ({ weight: mine ? 6 : 3, opacity: mine ? 1 : 0.65 });
let locationMarker  = null;

// ── MAPPA ────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([44.4949, 11.3426], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

// ── PROGRESS ─────────────────────────────────────────────────────────────────
function setProgress(pct, text) {
  $('bar').style.width = pct + '%';
  $('prog-text').textContent = text;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function render({ streets, stats }) {
  allStreets = streets;
  const zonesFound = new Set();

  for (const s of streets) {
    if (!s.matched || !s.polylines.length) continue;
    const isMyZ = !!myZone && s.zones.includes(myZone);
    const tip   = `<b>${streetLabel(s)}</b><br>Zona: <b>${s.zones.join(', ')}</b>`;
    const k     = s.zones.length;

    // Una via con più zone (es. Corticella A+I) è disegnata in ciascuna delle sue zone, a tratti
    // alternati nei colori delle zone: resta visibile finché almeno una delle sue zone è visibile.
    s.zones.forEach((z, i) => {
      zonesFound.add(z);
      if (!zoneLayers[z]) {
        zoneLayers[z]    = L.layerGroup();
        zonePolylines[z] = [];
        if (!hiddenZones.has(z)) zoneLayers[z].addTo(map);
      }
      const style = { color: zoneColor(z), ...polylineStyle(isMyZ) };
      if (k > 1) {
        style.dashArray = `${DASH},${DASH * (k - 1)}`;
        style.dashOffset = String((k * DASH - i * DASH) % (k * DASH));
        style.lineCap = 'butt';
      }
      for (const lls of s.polylines) {
        const pl = L.polyline(lls, style).bindTooltip(tip);
        pl.addTo(zoneLayers[z]);
        zonePolylines[z].push(pl);
        streetPolylines.push({ pl, zones: s.zones });
      }
    });
  }

  const sorted = [...zonesFound].sort(zoneSortFn);
  buildLegend(sorted);
  buildSettings(sorted, stats, streets);
  $('loading').style.display = 'none';
}

// ── SORT ZONE ─────────────────────────────────────────────────────────────────
function zoneSortFn(a, b) {
  const n = s => (isNaN(s) || s === '') ? Infinity : +s;
  const na = n(a), nb = n(b);
  if (na !== Infinity && nb !== Infinity) return na - nb;
  if (na !== Infinity) return -1;
  if (nb !== Infinity) return 1;
  if (a === 'MISTA') return 1;
  if (b === 'MISTA') return -1;
  return a.localeCompare(b);
}

// ── LEGENDA CON FILTRI ────────────────────────────────────────────────────────
function buildLegend(zones) {
  const el = $('legend-items');
  el.innerHTML = '';

  for (const z of zones) {
    const color  = zoneColor(z);
    const label  = z === 'MISTA' ? 'Zone miste' : `Zona ${z}`;
    const hidden = hiddenZones.has(z);
    const row    = document.createElement('div');
    row.className   = 'leg-row' + (hidden ? ' leg-hidden' : '');
    row.dataset.zone = z;
    row.title = hidden ? 'Mostra zona' : 'Nascondi zona';
    row.innerHTML = `
      <div class="leg-swatch" style="background:${color}"></div>
      <span class="leg-label">${label}</span>
      <span class="leg-eye">${hidden ? '○' : '●'}</span>
    `;
    row.addEventListener('click', () => toggleZone(z));
    el.appendChild(row);
  }

  el.insertAdjacentHTML('beforeend', `
    <div class="leg-divider"></div>
    <div class="leg-my-zone">
      <div class="leg-my-label">La mia zona</div>
      <select id="zone-select">
        <option value="">— scegli —</option>
        ${zones.map(z =>
          `<option value="${z}" ${z === myZone ? 'selected' : ''}>${z === 'MISTA' ? 'MISTA' : `Zona ${z}`}</option>`
        ).join('')}
      </select>
    </div>
  `);
  $('zone-select').addEventListener('change', e => setMyZone(e.target.value));
  $('legend').style.display = 'block';
  updateLegendSummary();
}

// Legenda collassata di default: mostra solo "Zone" (+ la mia zona, se scelta)
function setLegendOpen(open) {
  $('legend').classList.toggle('collapsed', !open);
  $('legend-toggle').setAttribute('aria-expanded', String(open));
}

function updateLegendSummary() {
  $('legend-summary').textContent = myZone ? (myZone === 'MISTA' ? 'Mista' : `Zona ${myZone}`) : '';
}

$('legend-toggle').addEventListener('click', () => setLegendOpen($('legend').classList.contains('collapsed')));

// ── TOGGLE VISIBILITÀ ZONA ────────────────────────────────────────────────────
function toggleZone(zone) {
  if (hiddenZones.has(zone)) {
    hiddenZones.delete(zone);
    if (zoneLayers[zone]) map.addLayer(zoneLayers[zone]);
  } else {
    hiddenZones.add(zone);
    if (zoneLayers[zone]) map.removeLayer(zoneLayers[zone]);
  }
  localStorage.setItem('hiddenZones', JSON.stringify([...hiddenZones]));
  syncSettings();
  const row = document.querySelector(`.leg-row[data-zone="${zone}"]`);
  if (row) {
    const h = hiddenZones.has(zone);
    row.classList.toggle('leg-hidden', h);
    row.title = h ? 'Mostra zona' : 'Nascondi zona';
    row.querySelector('.leg-eye').textContent = h ? '○' : '●';
  }
}

// ── IMPOSTA LA MIA ZONA ───────────────────────────────────────────────────────
function setMyZone(zone) {
  myZone = zone;
  localStorage.setItem('myZone', zone);
  window.ParResBoNative?.setMyZone(zone);   // condivisa con Android Auto
  updateLegendSummary();
  syncSettings();
  const sel = $('zone-select');
  if (sel) sel.value = zone;
  for (const { pl, zones } of streetPolylines) pl.setStyle(polylineStyle(zone !== '' && zones.includes(zone)));
}

// ── GEOLOCALIZZAZIONE ─────────────────────────────────────────────────────────
const LOCATE_LABEL = '<span class="locate-icon">◎</span> Posso parcheggiare qui?';

function setupLocateBtn() {
  const btn = $('locate-btn');
  btn.innerHTML = LOCATE_LABEL;
  btn.style.display = 'flex';
  btn.addEventListener('click', () => {
    if (DEBUG && simMode) {
      if (simMarker) {
        const { lat, lng } = simMarker.getLatLng();
        showPositionResult(lat, lng);
      } else {
        showLocateResult('Tocca la mappa per posizionare il puntino.', 'neutral');
      }
      return;
    }
    if (!navigator.geolocation) {
      showLocateResult('Geolocalizzazione non supportata dal browser.', 'neutral');
      return;
    }
    const t0 = performance.now();
    const fix = freshFix();
    if (fix) {   // GPS già caldo: risposta immediata
      onPosition(fix);
      debugTiming(`posizione dalla cache (${Math.round(Date.now() - lastFix.t)} ms fa)`, t0);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Ricerca…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        btn.disabled = false;
        btn.innerHTML = LOCATE_LABEL;
        const tFix = performance.now();
        onPosition(pos);
        debugTiming(`fix GPS ${Math.round(tFix - t0)} ms`, tFix);
        gpsWanted = true;
        startGpsWatch();   // dal prossimo tocco il GPS è già caldo
      },
      err => {
        btn.disabled = false;
        btn.innerHTML = LOCATE_LABEL;
        showLocateResult('Posizione non disponibile: ' + err.message, 'neutral');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  // Se il permesso c'è già, scalda il GPS subito (senza far comparire richieste all'avvio)
  navigator.permissions?.query({ name: 'geolocation' }).then(st => {
    if (st.state === 'granted') { gpsWanted = true; startGpsWatch(); }
  }).catch(() => {});
  // Il GPS acceso consuma batteria: solo con l'app in primo piano
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopGpsWatch(); else if (gpsWanted) startGpsWatch();
  });
}

// GPS "caldo": un getCurrentPosition ad alta precisione da freddo impiega 1-2 s, quindi mentre l'app
// è in primo piano teniamo un watchPosition e al tocco usiamo l'ultimo fix se è recente.
const FIX_MAX_AGE_MS = 5000;
let lastFix = null;       // { pos, t }
let gpsWatchId = null;
let gpsWanted = false;    // l'utente ha già dato il permesso / usato il GPS

function startGpsWatch() {
  if (gpsWatchId !== null || !navigator.geolocation || document.hidden) return;
  gpsWatchId = navigator.geolocation.watchPosition(
    pos => { lastFix = { pos, t: Date.now() }; },
    () => {},   // gli errori li gestisce getCurrentPosition al tocco
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

function stopGpsWatch() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
  lastFix = null;
}

const freshFix = () => lastFix && Date.now() - lastFix.t <= FIX_MAX_AGE_MS ? lastFix.pos : null;

// Tempi dell'ultima risposta, visibili nel pannello debug (t = istante in cui è arrivata la posizione)
function debugTiming(source, t) {
  const el = DEBUG && $('debug-timing');
  if (el) el.textContent = `⏱ ${source}, risposta ${(performance.now() - t).toFixed(1)} ms`;
}

function onPosition({ coords: { latitude: lat, longitude: lng } }) {
  if (locationMarker) locationMarker.remove();
  locationMarker = L.circleMarker([lat, lng], {
    radius: 9, color: '#1d4ed8', weight: 3,
    fillColor: '#3b82f6', fillOpacity: 0.9,
  }).bindTooltip('La tua posizione').addTo(map);
  map.setView([lat, lng], 16);
  showPositionResult(lat, lng);
}

const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
let parkingMarker = null;

// SÌ / NO! a tutto schermo in base alla zona della via più vicina a (lat, lng)
function showPositionResult(lat, lng) {
  hideVerdict();
  const c = Geo.classify(allStreets, lat, lng);

  // Lontano da ogni via con zona residenti: non si può dire né SÌ né NO
  if (c.kind !== 'street') {
    const n = c.nearest;
    showVerdict(c.kind === 'outside'
      ? { tone: 'none', title: '?', headline: 'Sei fuori zona',
          sub: n ? `Le strade con zona residenti di Bologna più vicine sono a circa ${fmtDist(n.distM)}.`
                 : 'Non ci sono dati per questa posizione.' }
      : { tone: 'none', title: '?', headline: 'Nessuna zona qui',
          sub: `Nessuna via con zona residenti entro ${Geo.MAX_STREET_M} m. La più vicina è ${streetLabel(n.street)} (${fmtDist(n.distM)}).` });
    return;
  }

  const { street } = c;
  const zones = street.zones.join(', ');

  if (!myZone) {
    showLocateResult(`<b>${streetLabel(street)}</b> &nbsp;·&nbsp; Zona <b>${zones}</b>
      <div class="res-sub">Scegli la tua zona nel menu “Zone” per sapere se puoi parcheggiare</div>`, 'neutral');
    setLegendOpen(true);
    return;
  }

  if (street.zones.includes(myZone)) {
    showVerdict({ tone: 'yes', title: 'SÌ', headline: streetLabel(street), sub: `Puoi parcheggiare qui · zona ${myZone}` });
    return;
  }

  const target = Geo.nearestInZone(allStreets, lat, lng, myZone);
  showVerdict({ tone: 'no', title: 'NO!', headline: streetLabel(street), sub: `Non è la tua zona (${zones}) · la tua è ${myZone}`, target });
}

const VERDICT_MS = 5000;
let verdictTimer = null;

function showVerdict({ tone, title, headline, sub, target }) {
  const el = $('verdict');
  el.className = 'verdict verdict-' + tone;
  el.innerHTML = `
    <div class="verdict-big">${title}</div>
    <div class="verdict-street">${headline}</div>
    <div class="verdict-sub">${sub}</div>
    ${target ? `<button class="verdict-nav">Vuoi andare al parcheggio più vicino?
      <small>${streetLabel(target.street)} · ${fmtDist(target.distM)}</small></button>` : ''}
    <div class="verdict-note">Verifica sempre la segnaletica stradale</div>
    <div class="verdict-timer"></div>`;
  el.style.display = 'flex';
  // Si chiude toccando un punto qualsiasi, oppure da solo dopo 5 secondi
  el.onclick = dismissVerdict;
  clearTimeout(verdictTimer);
  verdictTimer = setTimeout(dismissVerdict, VERDICT_MS);
  if (target) {
    parkingMarker = L.marker([target.lat, target.lng], {
      icon: L.divIcon({ className: 'parking-pin', html: 'P', iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).addTo(map);
    el.querySelector('.verdict-nav').onclick = e => {
      e.stopPropagation();
      dismissVerdict();
      openNavigation(target);
    };
  }
}

// Chiude il verdetto ma lascia sulla mappa il pin del parcheggio più vicino
function dismissVerdict() {
  clearTimeout(verdictTimer);
  $('verdict').style.display = 'none';
}

// Chiude il verdetto e toglie anche il pin (nuovo controllo, cambio modalità)
function hideVerdict() {
  dismissVerdict();
  if (parkingMarker) { parkingMarker.remove(); parkingMarker = null; }
}

function openNavigation(target) {
  const label = `${streetLabel(target.street)} (zona ${myZone})`;
  const url = Geo.navigationUrl(target.lat, target.lng, label, navigator.userAgent);
  if (url.startsWith('geo:')) window.location.href = url;   // l'app Android lo gira al sistema (scelta app)
  else window.open(url, '_blank', 'noopener');
}

// ── TOAST RISULTATO ───────────────────────────────────────────────────────────
function showLocateResult(html, type) {
  const el = $('locate-result');
  el.innerHTML = html + '<button class="res-close" aria-label="chiudi">✕</button>';
  el.className = 'locate-result locate-result-' + type;
  el.style.display = 'block';
  el.querySelector('.res-close').onclick = () => { el.style.display = 'none'; };
}

// ── AVVISO LEGALE (primo avvio) ───────────────────────────────────────────────
// Cambiare DISCLAIMER_KEY se il testo cambia in modo sostanziale: l'avviso viene mostrato di nuovo.
const DISCLAIMER_KEY = 'disclaimerV2';
const disclaimerAccepted = () =>
  localStorage.getItem(DISCLAIMER_KEY) === '1' || window.ParResBoNative?.isDisclaimerAccepted?.() === true;

function showDisclaimer() {
  const el = $('disclaimer');
  el.innerHTML = `
    <div class="disclaimer-card">
      <h2>Prima di iniziare</h2>
      <p><b>ParResBo non è un’app ufficiale del Comune di Bologna.</b></p>
      <p>Le zone e le strade arrivano dagli <b>open data pubblici del Comune di Bologna</b>, le mappe da
         OpenStreetMap. I dati possono essere <b>incompleti, non aggiornati o imprecisi</b>, e la posizione
         GPS può avere errori.</p>
      <p>Le risposte dell’app sono solo un aiuto: <b>fa sempre fede la segnaletica stradale</b>.
         L’autore non risponde di multe, sanzioni o altri danni derivanti dall’uso dell’app.</p>
      <p><b>Non usare l’app mentre guidi</b>: fermati in un luogo sicuro.</p>
      <button id="disclaimer-ok">Ho capito</button>
    </div>`;
  el.style.display = 'flex';
  $('disclaimer-ok').onclick = () => {
    localStorage.setItem(DISCLAIMER_KEY, '1');
    window.ParResBoNative?.acceptDisclaimer?.();   // vale anche per Android Auto
    el.style.display = 'none';
  };
}
if (!disclaimerAccepted()) showDisclaimer();

// ── IMPOSTAZIONI ──────────────────────────────────────────────────────────────
// Vista a pieno schermo dentro la pagina. Nell'app Android la apre la barra nativa
// (window.ParResBo.showView); sul web si apre dal pulsante ⚙.
const IN_APP = navigator.userAgent.includes('ParResBoApp');
document.documentElement.classList.toggle('in-app', IN_APP);

const zoneName = z => z === 'MISTA' ? 'Zone miste' : `Zona ${z}`;
let settingsZones = [];

function buildSettings(zones, stats, streets) {
  settingsZones = zones;
  const notFound = streets.filter(s => !s.matched).sort((x, y) => (x.label ?? x.descr).localeCompare(y.label ?? y.descr));
  $('settings-body').innerHTML = `
    <section>
      <h3>La mia zona</h3>
      <p class="set-help">Serve per dirti se puoi parcheggiare dove ti trovi.</p>
      <select id="set-my-zone">
        <option value="">— scegli —</option>
        ${zones.map(z => `<option value="${z}">${zoneName(z)}</option>`).join('')}
      </select>
    </section>
    <section>
      <h3>Zone sulla mappa</h3>
      <div class="set-actions">
        <button id="set-all">Mostra tutte</button>
        <button id="set-mine">Solo la mia</button>
        <button id="set-none">Nascondi tutte</button>
      </div>
      <div id="set-zones">
        ${zones.map(z => `
          <label class="set-zone" data-zone="${z}">
            <span class="leg-swatch" style="background:${zoneColor(z)}"></span>
            <span class="set-zone-name">${zoneName(z)}</span>
            <input type="checkbox" class="set-switch" data-zone="${z}">
          </label>`).join('')}
      </div>
    </section>
    <section>
      <h3>Dati</h3>
      <p class="set-help">Strade trovate sulla mappa: <b>${stats.matched}/${stats.total}</b> (${Math.round(100 * stats.matched / stats.total)}%)</p>
      ${notFound.length ? `<details id="set-unmatched">
        <summary>Strade non trovate (${notFound.length})</summary>
        <ul>${notFound.map(s => `<li>${s.label ?? s.descr} <span>[${s.zones.join(', ')}]</span></li>`).join('')}</ul>
      </details>` : ''}
    </section>
    <section>
      <h3>Informazioni</h3>
      <p class="set-help">Zone e strade: <a href="https://opendata.comune.bologna.it" target="_blank" rel="noopener">open data del Comune di Bologna</a>,
        licenza <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, elaborati da ParResBo.<br>
        Mappa e tracciati: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.<br>
        <a href="/privacy" target="_blank" rel="noopener">Informativa sulla privacy</a><br>
        <span id="set-version">Versione: <b>${PAGE_BUILD || '–'}</b></span>${PAGE_BUILD_TIME ? ` · ${fmtBuildTime(PAGE_BUILD_TIME)}` : ''}${APP_VERSION ? `<br>App Android: <b>${APP_VERSION}</b>` : ''}</p>
      <p id="set-update-status" class="set-status"></p>
      <div id="set-debug"></div>
      <button id="set-update">Aggiorna app (svuota la cache)</button>
      <button id="set-legal">Avviso legale</button>
      <button id="set-reset" class="set-danger">Ripristina impostazioni</button>
    </section>`;

  $('set-my-zone').addEventListener('change', e => setMyZone(e.target.value));
  $('set-zones').addEventListener('change', e => {
    const z = e.target.dataset.zone;
    if (z !== undefined && hiddenZones.has(z) === e.target.checked) toggleZone(z);
  });
  $('set-all').onclick  = () => settingsZones.forEach(z => setZoneVisible(z, true));
  $('set-none').onclick = () => settingsZones.forEach(z => setZoneVisible(z, false));
  $('set-mine').onclick = () => {
    if (!myZone) { $('set-my-zone').focus(); return; }
    settingsZones.forEach(z => setZoneVisible(z, z === myZone));
  };
  $('set-update').onclick = hardRefresh;
  $('set-legal').onclick = showDisclaimer;
  setupDebugSection();
  $('set-reset').onclick = () => {
    const b = $('set-reset');
    if (!b.dataset.armed) {            // niente confirm(): nella WebView non si vedrebbe
      b.dataset.armed = '1'; b.textContent = 'Sicuro? Tocca di nuovo'; return;
    }
    localStorage.removeItem('myZone'); localStorage.removeItem('hiddenZones');
    location.reload();
  };
  syncSettings();
}

// Modalità debug: voce visibile solo se già sbloccata; altrimenti compare con 5 tocchi sulla versione
function setupDebugSection() {
  const box = $('set-debug');
  const renderOn = () => {
    box.innerHTML = `<p class="set-status set-ok">Modalità debug attiva (posizione simulata sulla mappa)</p>
      <button id="set-debug-off">Disattiva debug</button>`;
    $('set-debug-off').onclick = () => { localStorage.removeItem('debugUnlocked'); location.reload(); };
  };
  const renderForm = () => {
    box.innerHTML = `<div class="set-debug-form">
      <input id="set-debug-pw" type="password" placeholder="Password debug" autocomplete="off">
      <button id="set-debug-go">Sblocca</button></div>
      <p id="set-debug-msg" class="set-status"></p>`;
    const go = async () => {
      const msg = $('set-debug-msg');
      msg.className = 'set-status'; msg.textContent = 'Verifica…';
      try {
        const r = await fetch('/api/debug/unlock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: $('set-debug-pw').value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { msg.classList.add('set-old'); msg.textContent = j.error ?? `Errore ${r.status}`; return; }
        localStorage.setItem('debugUnlocked', '1');
        DEBUG = true;
        setupDebugPanel();
        renderOn();
      } catch { msg.textContent = 'Impossibile contattare il server'; }
    };
    $('set-debug-go').onclick = go;
    $('set-debug-pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  };
  if (DEBUG) { renderOn(); return; }
  let taps = 0, last = 0;
  $('set-version').addEventListener('click', () => {
    const now = Date.now();
    taps = now - last < 1500 ? taps + 1 : 1; last = now;
    if (taps >= 5) { taps = 0; renderForm(); }
  });
}

function setZoneVisible(zone, visible) {
  if (hiddenZones.has(zone) === visible) toggleZone(zone);
}

// Allinea i controlli delle impostazioni allo stato (zona scelta, zone visibili)
function syncSettings() {
  const sel = $('set-my-zone');
  if (!sel) return;
  sel.value = myZone;
  for (const cb of document.querySelectorAll('.set-switch')) cb.checked = !hiddenZones.has(cb.dataset.zone);
}

function showView(name) {
  dismissVerdict();
  if (name === 'settings') refreshUpdateStatus();
  $('settings').style.display = name === 'settings' ? 'flex' : 'none';
}
window.ParResBo = { showView };

$('settings-fab').addEventListener('click', () => showView('settings'));
$('settings-close').addEventListener('click', () => showView('map'));
$('settings').addEventListener('click', e => { if (e.target === $('settings')) showView('map'); });  // clic fuori dalla scheda
if (!IN_APP) $('settings-fab').style.display = 'block';

// ── DEBUG: POSIZIONE SIMULATA ─────────────────────────────────────────────────
// Si sblocca con una password dalle Impostazioni (5 tocchi sulla versione), verificata dal server.
// Permette di scegliere tra GPS reale e un puntino trascinabile sulla mappa.
let DEBUG = localStorage.getItem('debugUnlocked') === '1';
let simMode   = false;
let simMarker = null;

function placeSimMarker(lat, lng) {
  if (!simMarker) {
    simMarker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({ className: 'sim-dot', iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(map);
    simMarker.on('dragend', () => {
      const p = simMarker.getLatLng();
      showPositionResult(p.lat, p.lng);
    });
  } else {
    simMarker.setLatLng([lat, lng]);
  }
  showPositionResult(lat, lng);
}

let debugPanelReady = false;
function setupDebugPanel() {
  if (!DEBUG || debugPanelReady) return;
  debugPanelReady = true;
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <b>DEBUG</b> posizione
    <label><input type="radio" name="posmode" value="gps" checked> GPS reale</label>
    <label><input type="radio" name="posmode" value="sim"> Simulata</label>
    <div id="debug-hint" style="display:none">Tocca la mappa o trascina il puntino</div>
    <div id="debug-timing"></div>`;
  document.body.appendChild(panel);

  panel.addEventListener('change', e => {
    simMode = e.target.value === 'sim';
    $('debug-hint').style.display = simMode ? 'block' : 'none';
    if (locationMarker) { locationMarker.remove(); locationMarker = null; }
    if (!simMode && simMarker) { simMarker.remove(); simMarker = null; }
    $('locate-result').style.display = 'none';
    hideVerdict();
  });
  map.on('click', e => { if (simMode) placeSimMarker(e.latlng.lat, e.latlng.lng); });
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Il server risponde 503 {loading:true} finché non ha finito il download iniziale (Overpass)
async function fetchStreets() {
  for (;;) {
    let r;
    try {
      r = await fetch('/api/streets');
    } catch {                      // nessuna connessione (galleria, treno…): si riprova da soli
      setProgress(30, 'Nessuna connessione: riprovo tra poco…');
      await sleep(5000);
      continue;
    }
    if (r.status === 503) {
      setProgress(30, 'Il server sta preparando i dati (solo al primo avvio, può richiedere qualche minuto)…');
      await sleep(5000);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }
}

async function main() {
  try {
    setProgress(10, 'Caricamento dati dal server…');
    const r = await fetchStreets();
    setProgress(70, 'Rendering mappa…');
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    setProgress(95, 'Disegno polilinee…');
    render(data);
    // Nell'app la zona può essere stata cambiata dall'auto: vale quella nativa
    const nativeZone = window.ParResBoNative?.getMyZone();
    if (nativeZone && nativeZone !== myZone) setMyZone(nativeZone);
    else if (myZone) window.ParResBoNative?.setMyZone(myZone);
    setupLocateBtn();
    setupDebugPanel();
  } catch (err) {
    $('prog-text').textContent = 'Errore: ' + err.message;
    console.error(err);
  }
}

// ── VERSIONE / AGGIORNAMENTO ──────────────────────────────────────────────────
// Ogni pagina porta il proprio BUILD_ID (meta "build"). Se il server ne ha uno diverso la pagina è
// vecchia (cache): si svuotano cache e service worker e si ricarica, una sola volta per versione.
const PAGE_BUILD = document.querySelector('meta[name="build"]')?.content ?? '';
const PAGE_BUILD_TIME = document.querySelector('meta[name="build-time"]')?.content ?? '';
const APP_VERSION = navigator.userAgent.match(/ParResBoApp\/([\w.]+)/)?.[1] ?? '';
const fmtBuildTime = iso => new Date(iso).toLocaleString('it-IT',
  { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Confronta la versione di questa pagina con quella pubblicata sul server (/version.json)
async function refreshUpdateStatus() {
  const el = $('set-update-status');
  if (!el) return;
  el.className = 'set-status';
  el.textContent = 'Controllo aggiornamenti…';
  try {
    const v = await (await fetch('/version.json', { cache: 'no-store' })).json();
    if (v.build === PAGE_BUILD) {
      el.classList.add('set-ok');
      el.textContent = '✓ Aggiornata: è l’ultima versione pubblicata';
    } else {
      el.classList.add('set-old');
      el.textContent = `⚠ Disponibile una versione più recente (${v.build}, ${fmtBuildTime(v.builtAt)}). Tocca “Aggiorna app”.`;
    }
  } catch {
    el.textContent = 'Impossibile controllare gli aggiornamenti (sei offline?)';
  }
}

async function hardRefresh() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map(r => r.unregister()));
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
  } catch (err) { console.warn('Pulizia cache non riuscita:', err); }
  location.reload();
}

async function checkBuild() {
  try {
    const { build } = await (await fetch('/version.json', { cache: 'no-store' })).json();
    if (build && PAGE_BUILD && build !== PAGE_BUILD && sessionStorage.getItem('refreshedFor') !== build) {
      sessionStorage.setItem('refreshedFor', build);
      await hardRefresh();
    }
  } catch { /* offline: si usa quello che c'è */ }
}
checkBuild();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker non registrato:', err));
}

main();

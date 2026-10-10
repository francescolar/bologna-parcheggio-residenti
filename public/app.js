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
    btn.disabled = true;
    btn.textContent = 'Ricerca…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        btn.disabled = false;
        btn.innerHTML = LOCATE_LABEL;
        onPosition(pos);
      },
      err => {
        btn.disabled = false;
        btn.innerHTML = LOCATE_LABEL;
        showLocateResult('Posizione non disponibile: ' + err.message, 'neutral');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
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
  const result = Geo.findNearestStreet(allStreets, lat, lng);
  if (!result) {
    showLocateResult('Nessuna strada trovata nelle vicinanze.', 'neutral');
    return;
  }
  const { street } = result;
  const zones = street.zones.join(', ');

  if (!myZone) {
    showLocateResult(`<b>${streetLabel(street)}</b> &nbsp;·&nbsp; Zona <b>${zones}</b>
      <div class="res-sub">Scegli la tua zona nel menu “Zone” per sapere se puoi parcheggiare</div>`, 'neutral');
    setLegendOpen(true);
    return;
  }

  if (street.zones.includes(myZone)) {
    showVerdict({ ok: true, title: 'SÌ', street, sub: `Puoi parcheggiare qui · zona ${myZone}` });
    return;
  }

  const target = Geo.nearestInZone(allStreets, lat, lng, myZone);
  showVerdict({ ok: false, title: 'NO!', street, sub: `Non è la tua zona (${zones}) · la tua è ${myZone}`, target });
}

const VERDICT_MS = 5000;
let verdictTimer = null;

function showVerdict({ ok, title, street, sub, target }) {
  const el = $('verdict');
  el.className = 'verdict ' + (ok ? 'verdict-yes' : 'verdict-no');
  el.innerHTML = `
    <div class="verdict-big">${title}</div>
    <div class="verdict-street">${streetLabel(street)}</div>
    <div class="verdict-sub">${sub}</div>
    ${target ? `<button class="verdict-nav">Vuoi andare al parcheggio più vicino?
      <small>${streetLabel(target.street)} · ${fmtDist(target.distM)}</small></button>` : ''}
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
      <p class="set-help">Zone e strade: open data del Comune di Bologna.<br>
        Mappa e geometrie: © OpenStreetMap contributors.<br>
        Versione: <b>${PAGE_BUILD || '–'}</b>${PAGE_BUILD_TIME ? ` · ${fmtBuildTime(PAGE_BUILD_TIME)}` : ''}${APP_VERSION ? `<br>App Android: <b>${APP_VERSION}</b>` : ''}</p>
      <p id="set-update-status" class="set-status"></p>
      <button id="set-update">Aggiorna app (svuota la cache)</button>
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
// Attivo con ?debug=1 oppure nella build debug dell'app Android (User-Agent "ParResBoDebug").
// Permette di scegliere tra GPS reale e un puntino trascinabile sulla mappa.
const DEBUG = /[?&]debug=1\b/.test(location.search) || navigator.userAgent.includes('ParResBoDebug');
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

function setupDebugPanel() {
  if (!DEBUG) return;
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <b>DEBUG</b> posizione
    <label><input type="radio" name="posmode" value="gps" checked> GPS reale</label>
    <label><input type="radio" name="posmode" value="sim"> Simulata</label>
    <div id="debug-hint" style="display:none">Tocca la mappa o trascina il puntino</div>`;
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
    const r = await fetch('/api/streets');
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

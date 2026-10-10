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

// ── STATE ────────────────────────────────────────────────────────────────────
let allStreets = [];
let myZone     = localStorage.getItem('myZone') || '';
let hiddenZones = new Set(JSON.parse(localStorage.getItem('hiddenZones') || '[]'));

const zoneLayers    = {};  // zone → L.layerGroup
const zonePolylines = {};  // zone → [L.polyline]
let locationMarker  = null;

// ── MAPPA ────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([44.4949, 11.3426], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

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
    const z = s.zone;
    zonesFound.add(z);

    if (!zoneLayers[z]) {
      zoneLayers[z]    = L.layerGroup();
      zonePolylines[z] = [];
      if (!hiddenZones.has(z)) zoneLayers[z].addTo(map);
    }

    const color = zoneColor(z);
    const isMyZ = myZone && s.zones.includes(myZone);
    const tip   = `<b>${s.descr}</b><br>Zona: <b>${s.zones.join(', ')}</b>`;

    for (const lls of s.polylines) {
      const pl = L.polyline(lls, {
        color,
        weight:  isMyZ ? 6 : 3,
        opacity: isMyZ ? 1 : 0.65,
      }).bindTooltip(tip);
      pl.addTo(zoneLayers[z]);
      zonePolylines[z].push(pl);
    }
  }

  const sorted = [...zonesFound].sort(zoneSortFn);
  buildLegend(sorted);
  buildStats(stats);
  buildUnmatchedPanel(streets);
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
}

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
  for (const [z, lines] of Object.entries(zonePolylines)) {
    const isMyZ = zone !== '' && z === zone;
    for (const pl of lines) {
      pl.setStyle({ weight: isMyZ ? 6 : 3, opacity: isMyZ ? 1 : 0.65 });
    }
  }
}

// ── GEOLOCALIZZAZIONE ─────────────────────────────────────────────────────────
function setupLocateBtn() {
  const btn = $('locate-btn');
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
        btn.innerHTML = '<span class="locate-icon">◎</span> Dove sono?';
        onPosition(pos);
      },
      err => {
        btn.disabled = false;
        btn.innerHTML = '<span class="locate-icon">◎</span> Dove sono?';
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

// Mostra a quale zona appartiene la via più vicina a (lat, lng) e se ci si può parcheggiare
function showPositionResult(lat, lng) {
  const result = findNearestStreet(lat, lng);
  if (!result) {
    showLocateResult('Nessuna strada trovata nelle vicinanze.', 'neutral');
    return;
  }

  const { street, distDeg } = result;
  const distM    = Math.round(distDeg * 111_000);
  const zones    = street.zones.join(', ');
  const inMyZone = myZone && street.zones.includes(myZone);
  const noZone   = !myZone;

  let html, type;
  if (noZone) {
    html = `<b>${street.descr}</b> &nbsp;·&nbsp; Zona <b>${zones}</b>
            <div class="res-sub">Imposta la tua zona per sapere se puoi parcheggiare &nbsp;(~${distM} m)</div>`;
    type = 'neutral';
  } else if (inMyZone) {
    html = `<b>${street.descr}</b> &nbsp;·&nbsp; Zona <b>${zones}</b>
            <div class="res-sub">✓ Puoi parcheggiare qui &nbsp;(zona ${myZone}, ~${distM} m)</div>`;
    type = 'ok';
  } else {
    html = `<b>${street.descr}</b> &nbsp;·&nbsp; Zona <b>${zones}</b>
            <div class="res-sub">✗ Non è la tua zona &nbsp;(tua: <b>${myZone}</b>, ~${distM} m)</div>`;
    type = 'no';
  }
  showLocateResult(html, type);
}

// ── TROVA VIA PIÙ VICINA ──────────────────────────────────────────────────────
function ptSegDist(lat, lng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng, dy = bLat - aLat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(lng - aLng, lat - aLat);
  const t = Math.max(0, Math.min(1, ((lng - aLng) * dx + (lat - aLat) * dy) / len2));
  return Math.hypot(lng - (aLng + t * dx), lat - (aLat + t * dy));
}

function findNearestStreet(lat, lng) {
  let best = null, bestD = Infinity;
  for (const s of allStreets) {
    if (!s.matched || !s.polylines.length) continue;
    for (const line of s.polylines) {
      for (let i = 0; i < line.length - 1; i++) {
        const d = ptSegDist(lat, lng, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (line.length === 1) {
        const d = Math.hypot(lng - line[0][1], lat - line[0][0]);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
  }
  return best ? { street: best, distDeg: bestD } : null;
}

// ── TOAST RISULTATO ───────────────────────────────────────────────────────────
function showLocateResult(html, type) {
  const el = $('locate-result');
  el.innerHTML = html + '<button class="res-close" aria-label="chiudi">✕</button>';
  el.className = 'locate-result locate-result-' + type;
  el.style.display = 'block';
  el.querySelector('.res-close').onclick = () => { el.style.display = 'none'; };
}

// ── STATS ────────────────────────────────────────────────────────────────────
function buildStats({ matched, total }) {
  const pct = Math.round(100 * matched / total);
  $('stats').textContent = `Strade trovate: ${matched}/${total} (${pct}%)`;
  $('stats').style.display = 'block';
}

// ── PANNELLO STRADE NON TROVATE ───────────────────────────────────────────────
function buildUnmatchedPanel(streets) {
  const notFound = streets.filter(s => !s.matched).sort((a, b) => a.descr.localeCompare(b.descr));
  if (!notFound.length) return;
  const btn = $('unmatched-btn');
  btn.textContent = `${notFound.length} strade non trovate →`;
  btn.style.display = 'block';
  const list = $('unmatched-list');
  for (const s of notFound) {
    list.insertAdjacentHTML('beforeend',
      `<li>${s.descr} <span>[${s.zones.join(',')}]</span></li>`);
  }
  btn.onclick = () => $('unmatched-panel').classList.add('open');
  $('unmatched-close').onclick = () => $('unmatched-panel').classList.remove('open');
  $('unmatched-panel').style.display = null;
}

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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker non registrato:', err));
}

main();

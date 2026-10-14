'use strict';

// Funzioni geografiche pure: usate dal browser (window.Geo) e dai test (require).
(function (root) {
  const M_PER_DEG_LNG_AT_EQUATOR = 111320;
  const M_PER_DEG_LAT = 110574;

  // Punto più vicino a (qLat, qLng) sul segmento a→b, in una proiezione piana locale (metri).
  function closestOnSegment(qLat, qLng, aLat, aLng, bLat, bLng) {
    const kx = Math.cos(qLat * Math.PI / 180) * M_PER_DEG_LNG_AT_EQUATOR;
    const ky = M_PER_DEG_LAT;
    const ax = (aLng - qLng) * kx, ay = (aLat - qLat) * ky;
    const bx = (bLng - qLng) * kx, by = (bLat - qLat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    return {
      distM: Math.hypot(ax + t * dx, ay + t * dy),
      lat: aLat + t * (bLat - aLat),
      lng: aLng + t * (bLng - aLng),
    };
  }

  // Indice a griglia dei segmenti: la ricerca guarda solo le celle attorno al punto (a anelli
  // crescenti) invece di tutti i segmenti. Si costruisce una volta per array `streets`.
  const CELL_DEG = 0.002;   // lato di una cella in latitudine (~220 m)
  const indexes = new WeakMap();

  function buildIndex(streets) {
    const segs = [];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const s of streets) {
      if (!s.matched || !s.polylines.length) continue;
      for (const line of s.polylines) {
        const last = line.length === 1 ? 1 : line.length - 1; // linea di un solo punto = segmento nullo
        for (let i = 0; i < last; i++) {
          const a = line[i], b = line[Math.min(i + 1, line.length - 1)];
          segs.push({ s, aLat: a[0], aLng: a[1], bLat: b[0], bLng: b[1] });
          minLat = Math.min(minLat, a[0], b[0]); maxLat = Math.max(maxLat, a[0], b[0]);
          minLng = Math.min(minLng, a[1], b[1]); maxLng = Math.max(maxLng, a[1], b[1]);
        }
      }
    }
    if (!segs.length) return { segs };
    const cellLng = CELL_DEG / Math.cos((minLat + maxLat) / 2 * Math.PI / 180); // celle ~quadrate in metri
    const cols = Math.floor((maxLng - minLng) / cellLng) + 1;
    const rows = Math.floor((maxLat - minLat) / CELL_DEG) + 1;
    const cells = new Map();
    for (const seg of segs) {
      const x0 = Math.floor((Math.min(seg.aLng, seg.bLng) - minLng) / cellLng);
      const x1 = Math.floor((Math.max(seg.aLng, seg.bLng) - minLng) / cellLng);
      const y0 = Math.floor((Math.min(seg.aLat, seg.bLat) - minLat) / CELL_DEG);
      const y1 = Math.floor((Math.max(seg.aLat, seg.bLat) - minLat) / CELL_DEG);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const key = y * cols + x;
          const cell = cells.get(key);
          if (cell) cell.push(seg); else cells.set(key, [seg]);
        }
      }
    }
    return { segs, cells, cols, rows, minLat, minLng, cellLng };
  }

  // Via (con punto e distanza in metri) più vicina; `filter` limita le vie considerate.
  function nearest(streets, lat, lng, filter) {
    let idx = indexes.get(streets);
    if (!idx) indexes.set(streets, idx = buildIndex(streets));
    if (!idx.segs.length) return null;

    const { cells, cols, rows, cellLng } = idx;
    const cx = Math.floor((lng - idx.minLng) / cellLng);
    const cy = Math.floor((lat - idx.minLat) / CELL_DEG);
    // Un segmento non ancora visto dopo l'anello r dista almeno r celle: da qui il criterio di stop.
    const minCellM = Math.min(CELL_DEG * M_PER_DEG_LAT, cellLng * Math.cos(lat * Math.PI / 180) * M_PER_DEG_LNG_AT_EQUATOR);
    // Gli anelli prima di r0 non toccano la griglia (punto lontano dai dati): si salta direttamente a r0.
    const r0 = Math.max(0, -cx, cx - (cols - 1), -cy, cy - (rows - 1));
    const rMax = r0 + Math.max(cols, rows);

    let best = null;
    const scan = (x, y) => {
      const cell = cells.get(y * cols + x);
      if (!cell) return;
      for (const seg of cell) {
        if (filter && !filter(seg.s)) continue;
        const c = closestOnSegment(lat, lng, seg.aLat, seg.aLng, seg.bLat, seg.bLng);
        if (!best || c.distM < best.distM) best = { street: seg.s, distM: c.distM, lat: c.lat, lng: c.lng };
      }
    };
    for (let r = r0; r <= rMax; r++) {
      const xa = Math.max(cx - r, 0), xb = Math.min(cx + r, cols - 1);
      for (let y = Math.max(cy - r, 0); y <= Math.min(cy + r, rows - 1); y++) {
        if (y === cy - r || y === cy + r) {
          for (let x = xa; x <= xb; x++) scan(x, y);
        } else {
          if (cx - r >= 0) scan(cx - r, y);
          if (cx + r < cols) scan(cx + r, y);
        }
      }
      if (best && best.distM <= r * minCellM) break;
    }
    return best;
  }

  const findNearestStreet = (streets, lat, lng) => nearest(streets, lat, lng);
  const nearestInZone = (streets, lat, lng, zone) =>
    nearest(streets, lat, lng, s => s.zones.includes(zone));

  // Dove sei rispetto ai dati: su una via con zona, vicino a Bologna ma senza zona, o fuori zona.
  // Il dataset contiene solo le vie con zona residenti: lontano da ognuna non si può dire né SÌ né NO.
  const MAX_STREET_M = 60;    // oltre questa distanza non sei su una via con zona residenti (errore GPS incluso)
  const OUTSIDE_M = 3000;     // oltre questa distanza dalla via più vicina sei fuori dall'area coperta
  function classify(streets, lat, lng) {
    const n = nearest(streets, lat, lng);
    if (!n) return { kind: 'outside', nearest: null };
    if (n.distM <= MAX_STREET_M) return { kind: 'street', ...n };
    return { kind: n.distM > OUTSIDE_M ? 'outside' : 'nozone', nearest: n };
  }

  // Link per aprire la navigazione verso un punto nell'app di mappe del dispositivo.
  // Android: geo: → il sistema propone tutte le app di mappe/navigazione installate.
  function navigationUrl(lat, lng, label, userAgent) {
    const ua = userAgent || '';
    if (/Android/i.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
    if (/iPhone|iPad|iPod/i.test(ua)) return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }

  root.closestOnSegment = closestOnSegment;
  root.__nearest = nearest;   // solo per i test (filtro arbitrario)
  root.findNearestStreet = findNearestStreet;
  root.nearestInZone = nearestInZone;
  root.navigationUrl = navigationUrl;
  root.classify = classify;
  root.MAX_STREET_M = MAX_STREET_M;
  root.OUTSIDE_M = OUTSIDE_M;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.Geo = {}));

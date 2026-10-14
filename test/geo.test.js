'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const Geo    = require('../public/geo');

const street = (name, zones, polylines) =>
  ({ descr: name, zones, zone: zones.length === 1 ? zones[0] : 'MISTA', matched: true, polylines });

// ~111 m per 0.001° di latitudine
const A = street('A(VIA)', ['1'], [[[44.4900, 11.3400], [44.4900, 11.3500]]]);          // orizzontale a lat 44.49
const B = street('B(VIA)', ['2'], [[[44.4950, 11.3400], [44.4950, 11.3500]]]);          // orizzontale a lat 44.495
const C = street('C(VIA)', ['2'], [[[44.5100, 11.3450]]]);                              // un solo punto
const U = { ...street('U(VIA)', ['2'], [[[44.4901, 11.3450], [44.4901, 11.3460]]]), matched: false };

test('closestOnSegment: proiezione sul segmento e distanza in metri', () => {
  const r = Geo.closestOnSegment(44.4910, 11.3450, 44.4900, 11.3400, 44.4900, 11.3500);
  assert.ok(Math.abs(r.lat - 44.4900) < 1e-9);
  assert.ok(Math.abs(r.lng - 11.3450) < 1e-6);
  assert.ok(Math.abs(r.distM - 110.6) < 1);          // 0.001° di latitudine ≈ 110,6 m
});

test('closestOnSegment: fuori dal segmento ripiega sull’estremo', () => {
  const r = Geo.closestOnSegment(44.4900, 11.3300, 44.4900, 11.3400, 44.4900, 11.3500);
  assert.equal(r.lng, 11.3400);
  assert.ok(r.distM > 700 && r.distM < 800);          // 0.01° di longitudine a 44,49° ≈ 794 m
});

test('closestOnSegment: segmento degenere (a = b)', () => {
  const r = Geo.closestOnSegment(44.4910, 11.3450, 44.4900, 11.3450, 44.4900, 11.3450);
  assert.equal(r.lat, 44.4900);
  assert.ok(Math.abs(r.distM - 110.6) < 1);
});

test('findNearestStreet: sceglie la via più vicina e ignora quelle non abbinate', () => {
  const r = Geo.findNearestStreet([A, B, U], 44.4902, 11.3450);
  assert.equal(r.street, A);                          // U è più vicina ma matched=false
  assert.ok(r.distM < 30);
});

test('findNearestStreet: nessuna via → null', () => {
  assert.equal(Geo.findNearestStreet([], 44.49, 11.34), null);
  assert.equal(Geo.findNearestStreet([U], 44.49, 11.34), null);
});

test('nearestInZone: restituisce il punto più vicino nella zona richiesta', () => {
  const r = Geo.nearestInZone([A, B, C], 44.4902, 11.3450, '2');
  assert.equal(r.street, B);
  assert.ok(Math.abs(r.lat - 44.4950) < 1e-9);
  assert.ok(Math.abs(r.lng - 11.3450) < 1e-6);
});

test('nearestInZone: gestisce vie fatte di un solo punto', () => {
  const r = Geo.nearestInZone([A, C], 44.5090, 11.3450, '2');
  assert.equal(r.street, C);
  assert.equal(r.lat, 44.5100);
});

test('nearestInZone: zona senza vie → null; vie MISTA contano per tutte le loro zone', () => {
  assert.equal(Geo.nearestInZone([A, B], 44.49, 11.34, '9'), null);
  const M = street('M(VIA)', ['1', '2'], [[[44.5, 11.3], [44.5, 11.31]]]);
  assert.equal(Geo.nearestInZone([M], 44.49, 11.34, '2').street, M);
});

test('navigationUrl: Android usa geo:, iOS Apple Maps, altrimenti Google Maps', () => {
  const a = Geo.navigationUrl(44.49, 11.34, 'Via Rossi (Zona 1)', 'Mozilla/5.0 (Linux; Android 15; wv)');
  assert.equal(a, 'geo:44.49,11.34?q=44.49,11.34(Via%20Rossi%20(Zona%201))');
  assert.match(Geo.navigationUrl(44.49, 11.34, 'x', 'iPhone'), /^https:\/\/maps\.apple\.com\/\?daddr=44\.49,11\.34/);
  assert.match(Geo.navigationUrl(44.49, 11.34, 'x', 'Linux x86_64'), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=44\.49,11\.34/);
});

test('classify: su una via (entro la soglia) → street, con via e distanza', () => {
  const r = Geo.classify([A, B], 44.4902, 11.3450);
  assert.equal(r.kind, 'street');
  assert.equal(r.street, A);
  assert.ok(r.distM < Geo.MAX_STREET_M);
});

test('classify: vicino ma non su una via con zona → nozone (con la via più vicina)', () => {
  // ~220 m a nord di A, ~170 m a sud di B: oltre la soglia da entrambe
  const r = Geo.classify([A, B], 44.4920, 11.3450);
  assert.equal(r.kind, 'nozone');
  assert.ok(r.nearest.distM > Geo.MAX_STREET_M && r.nearest.distM < Geo.OUTSIDE_M);
});

test('classify: lontano dalle vie (es. nelle Marche) → outside; nessun dato → outside', () => {
  const marche = Geo.classify([A, B], 43.6, 13.5);
  assert.equal(marche.kind, 'outside');
  assert.ok(marche.nearest.distM > Geo.OUTSIDE_M);
  assert.equal(Geo.classify([], 44.49, 11.34).kind, 'outside');
});

// Riferimento: scansione completa di tutti i segmenti (quello che faceva nearest prima dell'indice).
function bruteForce(streets, lat, lng, filter) {
  let best = null;
  for (const s of streets) {
    if (!s.matched || !s.polylines.length || (filter && !filter(s))) continue;
    for (const line of s.polylines) {
      const last = line.length === 1 ? 1 : line.length - 1;
      for (let i = 0; i < last; i++) {
        const a = line[i], b = line[Math.min(i + 1, line.length - 1)];
        const c = Geo.closestOnSegment(lat, lng, a[0], a[1], b[0], b[1]);
        if (!best || c.distM < best.distM) best = { street: s, ...c };
      }
    }
  }
  return best;
}

test('indice a griglia: stesso risultato della scansione completa (punti dentro, ai bordi e lontani)', () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const streets = [];
  for (let i = 0; i < 300; i++) {
    const lat = 44.47 + rnd() * 0.06, lng = 11.30 + rnd() * 0.08;
    const pts = [[lat, lng]];
    const n = 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) pts.push([pts[k][0] + (rnd() - 0.5) * 0.004, pts[k][1] + (rnd() - 0.5) * 0.004]);
    streets.push({ matched: i % 17 !== 0, zones: [String(i % 5)], polylines: [pts] });
  }
  streets.push({ matched: true, zones: ['0'], polylines: [[[44.5, 11.30], [44.5, 11.38]]] });   // via lunga: attraversa molte celle
  const queries = [];
  for (let i = 0; i < 400; i++) queries.push([44.45 + rnd() * 0.1, 11.27 + rnd() * 0.14]);
  queries.push([43.6, 13.5], [45.5, 9.2], [44.5, 11.34]);
  for (const [lat, lng] of queries) {
    for (const zone of [null, '3', '9']) {
      const filter = zone && (s => s.zones.includes(zone));
      const got = Geo.__nearest(streets, lat, lng, filter), want = bruteForce(streets, lat, lng, filter);
      if (!want) { assert.equal(got, null); continue; }
      assert.ok(Math.abs(got.distM - want.distM) < 1e-6, `${lat},${lng} zona ${zone}: ${got.distM} vs ${want.distM}`);
    }
  }
});

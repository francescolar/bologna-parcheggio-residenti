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

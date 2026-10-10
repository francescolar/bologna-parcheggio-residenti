'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKey, titleCase, parseCandidates, processStreets } = require('../server');

const way = (name, id = 1) => ({
  type: 'way', id, tags: { name },
  geometry: [{ lat: 44.49, lon: 11.34 }, { lat: 44.50, lon: 11.35 }],
});

test('normalizeKey: minuscolo, senza accenti, apostrofo finale = accento mancante', () => {
  assert.equal(normalizeKey('Via della Libertà'), 'via della liberta');
  assert.equal(normalizeKey("LIBERTA'"), 'liberta');
  assert.equal(normalizeKey('Via   Dell’Artigiano'), "via dell'artigiano");
});

test('titleCase: preposizioni in minuscolo tranne in prima posizione', () => {
  assert.equal(titleCase('GIOVANNI DEL VERRAZZANO'), 'Giovanni del Verrazzano');
  assert.equal(titleCase('DI VITTORIO'), 'Di Vittorio');
});

test('parseCandidates: formato "NOME(TIPO)"', () => {
  const p = parseCandidates('MARCONI(VIA)');
  assert.equal(p.candidates[0], 'Via Marconi');
  assert.equal(p.typeNorm, 'via');
});

test('parseCandidates: ordine inverso COGNOME NOME', () => {
  const { candidates } = parseCandidates('ROSSI MARIO(VIA)');
  assert.ok(candidates.includes('Via Rossi Mario'));
  assert.ok(candidates.includes('Via Mario Rossi'));
});

test('parseCandidates: tipo composto con apostrofo si attacca al nome', () => {
  const { candidates } = parseCandidates("ARTIGIANO(VIA DELL')");
  assert.equal(candidates[0], "Via dell'Artigiano");
});

test('parseCandidates: numeri in lettere diventano cifre', () => {
  const { candidates } = parseCandidates('DUE AGOSTO(PIAZZA)');
  assert.ok(candidates.includes('Piazza 2 Agosto'));
});

test('parseCandidates: correzione esplicita in testa ai candidati', () => {
  const { candidates } = parseCandidates('BENEDETTO QUATTOR.(VIA)');
  assert.equal(candidates[0], 'Via Benedetto XIV');
});

test('parseCandidates: PIAZZETTA prova anche Piazza', () => {
  const { candidates, altTypeNorm } = parseCandidates('GALVANI(PIAZZETTA)');
  assert.ok(candidates.includes('Piazza Galvani'));
  assert.equal(altTypeNorm, 'piazza');
});

test('parseCandidates: descrizione senza tipo tra parentesi resta com’è', () => {
  assert.deepEqual(parseCandidates('QUALCOSA').candidates, ['QUALCOSA']);
});

test('processStreets: match esatto e zona singola', () => {
  const { streets, stats } = processStreets(
    [{ via: 1, descr: 'MARCONI(VIA)', zona: 'A' }],
    [way('Via Marconi')],
  );
  assert.deepEqual(stats, { matched: 1, total: 1 });
  assert.equal(streets[0].zone, 'A');
  assert.equal(streets[0].matched, true);
  assert.deepEqual(streets[0].polylines, [[[44.49, 11.34], [44.50, 11.35]]]);
});

test('processStreets: più zone sulla stessa via → MISTA, zone ordinate e senza duplicati', () => {
  const { streets } = processStreets(
    [
      { via: 1, descr: 'MARCONI(VIA)', zona: 'B' },
      { via: 1, descr: 'MARCONI(VIA)', zona: 'A' },
      { via: 1, descr: 'MARCONI(VIA)', zona: 'A' },
    ],
    [way('Via Marconi')],
  );
  assert.equal(streets.length, 1);
  assert.deepEqual(streets[0].zones, ['A', 'B']);
  assert.equal(streets[0].zone, 'MISTA');
});

test('processStreets: suffix match (OSM ha il nome completo)', () => {
  const { streets } = processStreets(
    [{ via: 1, descr: 'MARCONI(VIA)', zona: 'A' }],
    [way('Via Guglielmo Marconi')],
  );
  assert.equal(streets[0].matched, true);
  assert.match(streets[0].matchedName, /suffix/);
});

test('processStreets: nessuna corrispondenza → matched=false, nessuna polilinea', () => {
  const { streets, stats } = processStreets(
    [{ via: 1, descr: 'INESISTENTE(VIA)', zona: 'A' }],
    [way('Via Marconi')],
  );
  assert.equal(streets[0].matched, false);
  assert.deepEqual(streets[0].polylines, []);
  assert.deepEqual(stats, { matched: 0, total: 1 });
});

test('processStreets: ignora way OSM senza nome o senza geometria', () => {
  const { stats } = processStreets(
    [{ via: 1, descr: 'MARCONI(VIA)', zona: 'A' }],
    [{ type: 'way', id: 1, tags: {}, geometry: [{ lat: 1, lon: 1 }] },
     { type: 'way', id: 2, tags: { name: 'Via Marconi' }, geometry: [] }],
  );
  assert.equal(stats.matched, 0);
});

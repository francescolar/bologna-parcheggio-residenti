'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const zlib   = require('node:zlib');
const http   = require('node:http');
const { app, BUILD_ID, _setCache } = require('../server');

let server, base;
test.before(async () => {
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const fixture = {
  streets: [{
    via: 1, descr: 'MARCONI(VIA)', zones: ['A'], zone: 'A', matched: true,
    matchedName: 'Via Marconi', polylines: [[[44.49, 11.34], [44.5, 11.35]]],
  }],
  stats: { matched: 1, total: 1 },
};

test('/healthz risponde 200 anche prima che i dati siano pronti', async () => {
  _setCache(null);
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, ready: false, build: BUILD_ID });
});

test('/api/streets durante il caricamento → 503 con Retry-After (senza lanciare fetch reali)', async () => {
  // Evita che getData() esca davvero in rete durante il test
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, ...a) =>
    String(url).startsWith(base) ? realFetch(url, ...a) : Promise.reject(new Error('rete disabilitata nei test'));
  try {
    _setCache(null);
    const r = await fetch(`${base}/api/streets`);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('retry-after'), '5');
    assert.deepEqual(await r.json(), { loading: true });
    await new Promise(r => setTimeout(r, 50)); // lascia assorbire il rifiuto del caricamento
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('/api/streets con dati pronti → 200 e JSON', async () => {
  _setCache(fixture);
  const r = await fetch(`${base}/api/streets`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), fixture);
  const h = await (await fetch(`${base}/healthz`)).json();
  assert.equal(h.ready, true);
});

test('/api/streets è compresso con gzip quando richiesto', async () => {
  // dati abbastanza grandi da superare la soglia di compressione
  _setCache({ ...fixture, streets: Array.from({ length: 200 }, (_, i) => ({ ...fixture.streets[0], via: i })) });
  const body = await new Promise((resolve, reject) => {
    http.get(`${base}/api/streets`, { headers: { 'Accept-Encoding': 'gzip' } }, res => {
      assert.equal(res.headers['content-encoding'], 'gzip');
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(zlib.gunzipSync(Buffer.concat(chunks)).toString()));
    }).on('error', reject);
  });
  assert.equal(JSON.parse(body).streets.length, 200);
});

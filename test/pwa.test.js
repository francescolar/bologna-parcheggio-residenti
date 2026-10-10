'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { app } = require('../server');

const PUBLIC = path.join(__dirname, '..', 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
const html     = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

let server, base;
test.before(async () => {
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('index.html collega il manifest', () => {
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
});

test('index.html non dipende da CDN esterne', () => {
  assert.doesNotMatch(html, /https?:\/\/unpkg\.com/);
});

test('il manifest ha le icone richieste per l’installabilità (192 e 512 PNG)', () => {
  const sizes = manifest.icons.filter(i => i.type === 'image/png').map(i => i.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  assert.equal(manifest.display, 'standalone');
});

test('tutte le icone del manifest esistono e sono servite', async () => {
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(PUBLIC, icon.src)), `${icon.src} manca su disco`);
    const r = await fetch(base + icon.src);
    assert.equal(r.status, 200, icon.src);
    assert.equal(r.headers.get('content-type').split(';')[0], icon.type, icon.src);
  }
});

test('Leaflet è servito in locale', async () => {
  for (const f of ['leaflet.js', 'leaflet.css', 'images/marker-icon.png']) {
    const r = await fetch(`${base}/vendor/leaflet/${f}`);
    assert.equal(r.status, 200, f);
  }
});

test('il service worker è servito e precarica solo file esistenti', async () => {
  const r = await fetch(`${base}/sw.js`);
  assert.equal(r.status, 200);
  const src = await r.text();
  const shell = JSON.parse(
    src.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
  );
  for (const p of shell) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, `${p} nello SHELL del service worker non è raggiungibile`);
  }
});

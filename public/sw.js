'use strict';

// Service worker: app shell (rete prima con timeout, poi cache) + /api/streets (cache subito,
// aggiornamento in background). Il nome della cache contiene il BUILD_ID: cambia a ogni deploy.
const CACHE = 'parresbo-__BUILD_ID__';  // il server sostituisce __BUILD_ID__ con l'hash dei file
const SHELL = [
  '/', '/style.css?v=__BUILD_ID__', '/app.js?v=__BUILD_ID__', '/geo.js?v=__BUILD_ID__', '/manifest.webmanifest',
  '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js',
  '/icons/icon.svg', '/icons/logo.svg', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
      // anche i dati delle strade, così l'app funziona offline già dalla prima volta (se il server non è
      // pronto, 503, non si salva niente: l'installazione non deve fallire per questo)
      .then(() => fetch('/api/streets').then(store('/api/streets')).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const NETWORK_TIMEOUT_MS = 4000;   // rete lenta (es. in treno): dopo 4 s si usa la cache, se c'è

const store = req => res => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
};

// Rete prima, ma senza aspettare all'infinito se la connessione c'è e non risponde
function networkFirst(req) {
  const net = fetch(req).then(store(req));
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  return Promise.race([net.catch(() => null), timeout])
    .then(res => res ?? caches.match(req).then(hit => hit ?? net));   // senza cache si aspetta la rete
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // tile della mappa: sempre dalla rete

  if (url.pathname === '/healthz') return;

  // Dati delle strade: si mostrano subito quelli già scaricati e si aggiornano in background
  // (cambiano di rado), così l'app parte anche con rete assente o lentissima.
  if (url.pathname === '/api/streets') {
    e.respondWith(caches.match(req).then(hit => {
      const update = fetch(req).then(store(req));
      if (!hit) return update;
      const done = update.catch(() => {});
      try { e.waitUntil(done); } catch { /* il worker potrebbe fermarsi prima: sarà per la prossima volta */ }
      return hit;
    }));
    return;
  }

  // Librerie e icone cambiano di rado: prima la cache. Il resto (HTML/JS/CSS dell'app): prima la rete,
  // così dopo un aggiornamento non si mescolano file vecchi e nuovi; offline o lenta si usa la cache.
  const staticAsset = url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/icons/');
  e.respondWith(
    staticAsset
      ? caches.match(req).then(hit => hit ?? fetch(req).then(store(req)))
      : networkFirst(req)
  );
});

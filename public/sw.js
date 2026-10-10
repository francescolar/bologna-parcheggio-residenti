'use strict';

// Service worker: app shell in cache (stale-while-revalidate) + ultimo /api/streets buono
// come fallback offline (network-first). Incrementare CACHE a ogni cambio di strategia.
const CACHE = 'parresbo-v2';
const SHELL = [
  '/', '/style.css', '/app.js', '/manifest.webmanifest',
  '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // tile della mappa: sempre dalla rete

  if (url.pathname === '/api/streets') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(hit => hit ?? Response.error()))
    );
    return;
  }

  if (url.pathname === '/healthz') return;

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit ?? net;
    })
  );
});

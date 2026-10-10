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

  // Via (con punto e distanza in metri) più vicina; `filter` limita le vie considerate.
  function nearest(streets, lat, lng, filter) {
    let best = null;
    for (const s of streets) {
      if (!s.matched || !s.polylines.length) continue;
      if (filter && !filter(s)) continue;
      for (const line of s.polylines) {
        const last = line.length === 1 ? 1 : line.length - 1; // linea di un solo punto = segmento nullo
        for (let i = 0; i < last; i++) {
          const a = line[i], b = line[Math.min(i + 1, line.length - 1)];
          const c = closestOnSegment(lat, lng, a[0], a[1], b[0], b[1]);
          if (!best || c.distM < best.distM) best = { street: s, distM: c.distM, lat: c.lat, lng: c.lng };
        }
      }
    }
    return best;
  }

  const findNearestStreet = (streets, lat, lng) => nearest(streets, lat, lng);
  const nearestInZone = (streets, lat, lng, zone) =>
    nearest(streets, lat, lng, s => s.zones.includes(zone));

  // Link per aprire la navigazione verso un punto nell'app di mappe del dispositivo.
  // Android: geo: → il sistema propone tutte le app di mappe/navigazione installate.
  function navigationUrl(lat, lng, label, userAgent) {
    const ua = userAgent || '';
    if (/Android/i.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
    if (/iPhone|iPad|iPod/i.test(ua)) return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }

  root.closestOnSegment = closestOnSegment;
  root.findNearestStreet = findNearestStreet;
  root.nearestInZone = nearestInZone;
  root.navigationUrl = navigationUrl;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.Geo = {}));

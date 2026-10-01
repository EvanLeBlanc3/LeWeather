// LeWeather service worker — keeps the app shell offline.
const VERSION = 'leweather-v1.0.0';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live weather / geocode APIs: always go to network (the app keeps its own saved copy).
  if (/open-meteo\.com|weather\.gov|bigdatacloud\.net/.test(url.hostname)) return;

  // Google Fonts: cache-first so the pixel fonts work offline after first load.
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(
      caches.open(VERSION + '-fonts').then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try { const res = await fetch(req); c.put(req, res.clone()); return res; }
        catch (err) { return hit || Response.error(); }
      })
    );
    return;
  }

  // App shell: stale-while-revalidate.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(VERSION).then(async c => {
        const hit = await c.match(req, { ignoreSearch: true });
        const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
        if (hit) { e.waitUntil(net); return hit; }
        const res = await net;
        if (res) return res;
        if (req.mode === 'navigate') return c.match('./index.html');
        return Response.error();
      })
    );
  }
});

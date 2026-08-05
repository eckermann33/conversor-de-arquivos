/**
 * CONVRT — service worker.
 *
 * Estratégia:
 *  - arquivos do próprio app: cache primeiro, rede em segundo plano
 *    (a página abre instantânea e continua funcionando offline);
 *  - bibliotecas de CDN: cache primeiro também, para que a segunda
 *    conversão funcione sem internet;
 *  - qualquer outra coisa: só rede.
 */
const VERSION = 'convrt-v2';
const APP_CACHE = VERSION + '-app';
const LIB_CACHE = VERSION + '-libs';

const APP_SHELL = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/formats.js',
  './assets/js/vendor.js',
  './assets/js/converters.js',
  './assets/js/app.js',
  './assets/icons/favicon.svg',
  './manifest.webmanifest'
];

const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApp = url.origin === self.location.origin;
  const isLib = LIB_HOSTS.includes(url.hostname);
  if (!isApp && !isLib) return;

  event.respondWith((async () => {
    const cacheName = isApp ? APP_CACHE : LIB_CACHE;
    const cached = await caches.match(request);

    const network = fetch(request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) {
        const copy = response.clone();
        caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) return cached;
    const fresh = await network;
    if (fresh) return fresh;
    if (isApp && request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('offline', { status: 503, statusText: 'offline' });
  })());
});

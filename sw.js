const VERSION = '3.4.4';
const CACHE = 'tournament-shell-v' + VERSION;
const FILES = ['./', './index.html', './mobile.css?v=' + VERSION, './app.js?v=' + VERSION, './live-share.js?v=' + VERSION, './ratings-sync.js?v=' + VERSION, './screen-views.js?v=' + VERSION, './i18n.js', './trf.js', './apk-core.js', './engine.js', './storage.js', './icon.svg', './manifest.webmanifest', './assets/google.png', './assets/fonts/roboto-regular.ttf', './assets/fonts/roboto-medium.ttf', './assets/fonts/roboto-bold.ttf', './assets/fonts/material-icons.ttf'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })));
  await self.skipWaiting();
})()));
function pageVersion(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, 1000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
    client.postMessage({ type: 'GET_APP_VERSION' }, [channel.port2]);
  });
}
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  const pages = await self.clients.matchAll({ type: 'window' });
  await Promise.all(pages.map(async client => {
    if (await pageVersion(client) === VERSION) return;
    const url = new URL(client.url);
    if (!url.pathname.startsWith(self.registration.scope.replace(url.origin, ''))) return;
    url.searchParams.set('v', VERSION);
    // Navigation fetches wait for activation; start it without blocking activation.
    client.navigate(url.href).catch(() => {});
  }));
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('tournament-shell-') && key !== CACHE).map(key => caches.delete(key)));
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
      return response;
    } catch {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      return cached || (event.request.mode === 'navigate' ? await cache.match('./index.html') : null) || Response.error();
    }
  })());
});


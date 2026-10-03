const CACHE_NAME = 'amazon-advances-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.jpg',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const core = url.pathname.endsWith('/index.html') ||
               url.pathname.endsWith('/app.js') ||
               url.pathname.endsWith('/style.css') ||
               url.pathname.endsWith('/manifest.json') ||
               url.pathname.endsWith('/sw.js');

  event.respondWith((async () => {
    if(core){
      try{
        const fresh = await fetch(req, {cache:'no-store'});
        const copy = fresh.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, copy);
        return fresh;
      }catch{
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    }
    try{
      const cached = await caches.match(req);
      if(cached) return cached;
      const fresh = await fetch(req);
      caches.open(CACHE_NAME).then(cache => cache.put(req, fresh.clone()));
      return fresh;
    }catch{
      return caches.match('./index.html');
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'سلف الموظفين';
  const options = {
    body: data.body || 'تم تحديث نظام السلف',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: './' },
    tag: data.tag || ('amazon-advances-' + Date.now())
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    const target = new URL('./', self.location.origin).href;
    for (const client of list) {
      if ('focus' in client) { client.focus(); return; }
    }
    return clients.openWindow(target);
  }));
});

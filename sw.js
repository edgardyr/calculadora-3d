// Guarda los archivos de la calculadora para que abra sin señal. Responde con lo guardado y lo actualiza por detrás;
// las tarifas y las tasas no pasan por aquí (las guarda app.js en el celular).
const CACHE = 'calc3d-50711d6fc26d';
const FILES = ['./', './index.html', './styles.css', './app.js', './calculo.js', './precio.mjs', './carta.js', './manifest.webmanifest', './corinne-logo.svg', './fonts/Fraunces-latin.woff2', './fonts/Figtree-latin.woff2'];
// GitHub Pages deja cada archivo 10 minutos en la caché del navegador: sin cache 'reload' una versión nueva podía
// guardarse con el app.js anterior.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Los íconos los pide el iPhone al agregar a inicio: van directo a la red, sin pasar por aquí. En un iPhone el
  // ícono salía como una «C» aunque el archivo estaba bien publicado.
  if (e.request.method !== 'GET' || url.origin !== location.origin || /\/inicio-\d+\.png$/.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});

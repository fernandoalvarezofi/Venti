/*
 * Lintick sin internet.
 * - Archivos de la app (JS, CSS, fuentes, íconos): se guardan la primera vez y se sirven desde el teléfono.
 * - Páginas que hacen falta sin señal (Mis entradas, Control de ingreso, eventos): primero se pide a internet;
 *   si no hay conexión (o tarda más de 4 s), se muestra la última versión guardada.
 * - Datos de la API: nunca se guardan acá (el control de ingreso usa su propia base local cifrada por evento).
 * - Al cerrar sesión, la web pide borrar las páginas guardadas (tienen datos personales).
 */
const VERSION = 'v2';
const STATIC = `lintick-static-${VERSION}`;
const PAGES = `lintick-pages-${VERSION}`;
const IMAGES = `lintick-images-${VERSION}`;
const OFFLINE_URL = '/offline';

const PAGE_ALLOW = [/^\/$/, /^\/mis-entradas(\/.*)?$/, /^\/acceso(\/.*)?$/, /^\/eventos(\/.*)?$/, /^\/ayuda$/, /^\/privacidad$/, /^\/terminos$/, /^\/offline$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(STATIC);
      await c.addAll([OFFLINE_URL, '/app/icon-192.png', '/app/icon-512.png', '/mascota/lintick-320.webp']);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES, IMAGES]);
      for (const k of await caches.keys()) if (k.startsWith('lintick-') && !keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'lintick:logout') event.waitUntil(caches.delete(PAGES));
  // Guardar de antemano las páginas clave (sólo si responden bien: sin sesión redirigen al login y no se guardan).
  if (event.data && event.data.type === 'lintick:warm' && Array.isArray(event.data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PAGES);
        for (const u of event.data.urls.slice(0, 6)) {
          try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin || !PAGE_ALLOW.some((re) => re.test(url.pathname))) continue;
            const res = await fetch(url.pathname, { credentials: 'same-origin' });
            if (res.ok && !res.redirected) await cache.put(url.pathname, res);
          } catch {
            /* sin conexión: se guarda la próxima vez */
          }
        }
      })(),
    );
  }
});

const isStaticAsset = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/app/') || url.pathname.startsWith('/mascota/') || /\.(woff2?|ttf)$/.test(url.pathname);

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function pageNetworkFirst(req, url) {
  const cache = await caches.open(PAGES);
  const key = url.pathname; // sin parámetros: una versión guardada por página
  try {
    const res = await withTimeout(fetch(req), 4000);
    // Sólo se guardan páginas reales (no redirecciones al login ni errores).
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  // Imágenes públicas de eventos (portadas, galería, logos): se ven aunque no haya señal.
  if (url.pathname.startsWith('/api/v1/media/')) {
    event.respondWith(staleWhileRevalidate(req, IMAGES));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // datos: siempre de internet

  // Navegaciones de Next (RSC) también llegan como GET: sólo guardamos la carga completa de la página.
  const isNavigation = req.mode === 'navigate';
  if (isNavigation && PAGE_ALLOW.some((re) => re.test(url.pathname))) {
    event.respondWith(pageNetworkFirst(req, url));
    return;
  }
  if (isNavigation) {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
  }
});

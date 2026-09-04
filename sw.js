// Service worker mínimo para que la PWA sea instalable y funcione offline
// para la carcasa de la app (HTML/CSS/JS propios). Estrategia
// "network-first": siempre intenta traer la versión más nueva de la red
// y solo cae al cache si no hay conexión — así un usuario nunca queda
// pegado con una versión vieja de src/router.js por culpa del cache.
//
// Deliberadamente NO cachea nada de Supabase (API, Storage, Auth) ni el
// script de supabase-js del CDN: esos siempre van directo a la red, para
// no arriesgar servir datos o tokens de sesión viejos desde el cache.

const CACHE_NAME = 'fight-club-gym-shell-v5';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './supabase-client.js',
  './ads.js',
  './qrcode-generator.min.js',
  './jsQR.min.js',
  './manifest.webmanifest',
  './src/router.js',
  './src/state.js',
  './src/actions.js',
  './src/data.js',
  './src/helpers.js',
  './src/qr.js',
  './src/screens/auth.js',
  './src/screens/owner.js',
  './src/screens/admin.js',
  './src/screens/client.js',
  './src/screens/trainer.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES).catch(() => {
      // Si algún archivo falla (p. ej. config.js no existe en un build sin
      // configurar), no rompemos la instalación del service worker por eso.
    }))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET, y solo mismo origen — todo lo demás (Supabase, CDN de
  // supabase-js, etc.) pasa directo a la red sin pasar por el service worker.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

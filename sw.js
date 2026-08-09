/* Service worker — offline shell for the demo apps.
   Cache-first for the app's own files, network-first for nothing (there is no
   network), and a single versioned cache so an update wipes the old one.
   Bump CACHE_VERSION whenever the file list or any cached asset changes. */

const CACHE_VERSION = 'v9';
const CACHE = `${self.registration.scope}::${CACHE_VERSION}`;

/* Populated by each app: the shell files that must work offline. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/cartline.css',
  './lib/ui.js',
  './lib/assistant.js',
  './lib/pwa.js',
  './src/main.js',
  './src/data.js',
  './src/agent.js',
  './src/actions.js',
  './src/cart.js',
  './src/chrome.js',
  './src/notify.js',
  './src/orderops.js',
  './src/views/board.js',
  './src/views/checkout.js',
  './src/views/discounts.js',
  './src/views/orders.js',
  './src/views/products.js',
  './src/views/settings.js',
  './src/views/shop.js',
  './src/views/summary.js',
  './src/views/track.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/products/banana-chips-200g.png',
  './assets/products/butter-croissant.png',
  './assets/products/chicken-biryani.png',
  './assets/products/coconut-loaf.png',
  './assets/products/coconut-oil-1l.png',
  './assets/products/coffee-powder-500g.png',
  './assets/products/date-pudding.png',
  './assets/products/date-roll.png',
  './assets/products/filter-coffee.png',
  './assets/products/fish-curry-meal.png',
  './assets/products/karak-chai.png',
  './assets/products/kerala-mixture-250g.png',
  './assets/products/kuboos-wrap.png',
  './assets/products/lime-mint-cooler.png',
  './assets/products/malabar-bun.png',
  './assets/products/mango-lassi.png',
  './assets/products/masala-peanuts.png',
  './assets/products/matta-rice-5kg.png',
  './assets/products/paneer-rice-bowl.png',
  './assets/products/payasam-cup.png',
  './assets/products/samosa-2-pcs.png',
  './assets/products/sulaimani-tea.png',
  './assets/products/tender-coconut-souffle.png',
  './assets/products/toor-dal-1kg.png',
  './assets/products/veg-meals-box.png',
  './assets/products/wheat-rusk-200g.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith(self.registration.scope)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Navigations: serve the shell so a reload works with no connection. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  /* Same-origin assets: cache first, then network, then whatever we have. */
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => { cachePut(req, res.clone()); return res; })),
    );
    return;
  }

  /* Cross-origin (the font stylesheet only): network, fall back to cache. */
  event.respondWith(
    fetch(req).then((res) => { cachePut(req, res.clone()); return res; }).catch(() => caches.match(req)),
  );
});

function cachePut(req, res) {
  if (!res || res.status !== 200 || (res.type !== 'basic' && res.type !== 'cors')) return;
  caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}

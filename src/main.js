/* ============================================================
   Cartline — boot: store, shell, navigation, router, assistant.
   ============================================================ */

import { h, qs, icon, createStore, router, toast, confirmDialog, modal } from '../lib/ui.js';
import { STORAGE_KEY, seedState, dayKey, lowStock } from './data.js';
import { cartCount, toggleCart, closeCart } from './cart.js';
import { closeOrder } from './orderops.js';
import { buildAgent } from './agent.js';

import renderShop from './views/shop.js';
import renderCheckout from './views/checkout.js';
import renderTrack from './views/track.js';
import renderBoard from './views/board.js';
import renderOrders from './views/orders.js';
import renderProducts from './views/products.js';
import renderDiscounts from './views/discounts.js';
import renderSummary from './views/summary.js';
import renderSettings from './views/settings.js';

const store = createStore(STORAGE_KEY, seedState);

const ROUTES = {
  shop: { face: 'shop', label: 'Shop', icon: 'grid', title: 'Shop', sub: 'Storefront', render: renderShop },
  checkout: { face: 'shop', label: 'Checkout', icon: 'cart', title: 'Checkout', sub: 'Storefront', render: renderCheckout },
  track: { face: 'shop', label: 'Track an order', icon: 'search', title: 'Track an order', sub: 'Storefront', render: renderTrack },
  board: { face: 'ops', label: 'Order board', icon: 'flow', title: 'Order board', sub: 'Operations', render: renderBoard },
  orders: { face: 'ops', label: 'Orders', icon: 'table', title: 'Orders', sub: 'Operations', render: renderOrders },
  products: { face: 'ops', label: 'Products and stock', icon: 'box', title: 'Products and stock', sub: 'Operations', render: renderProducts },
  discounts: { face: 'ops', label: 'Discount codes', icon: 'tag', title: 'Discount codes', sub: 'Operations', render: renderDiscounts },
  summary: { face: 'ops', label: 'Day summary', icon: 'chart', title: 'Day summary', sub: 'Operations', render: renderSummary },
  settings: { face: 'ops', label: 'Store settings', icon: 'cog', title: 'Store settings', sub: 'Operations', render: renderSettings },
};

const FACES = [
  { id: 'shop', label: 'Storefront', icon: 'cart', home: 'shop' },
  { id: 'ops', label: 'Operations', icon: 'chart', home: 'board' },
];

let current = 'shop';
let nav;

/* ---------- context passed to every view ---------- */
const ctx = {
  store,
  get state() { return store.state; },
  get route() { return current; },
  nav: (path) => { nav.navigate(path); },
  rerender: () => paintView(),
  syncChrome: () => syncChrome(),
  openCart: () => toggleCart(ctx),
  currency: () => store.state.settings.currency,
  today: () => dayKey(new Date()),
};

/* ---------- shell ---------- */

const app = qs('#app');
app.appendChild(h('div', { class: 'shell' },
  h('aside', { class: 'side', id: 'side' },
    h('div', { class: 'side__brand' },
      h('span', { class: 'mark' }, 'CL'),
      h('div', {},
        h('div', { class: 'side__name' }, 'Cartline'),
        h('div', { class: 'side__tag' }, 'Ordering and storefront'))),
    h('nav', { class: 'side__nav', id: 'nav', 'aria-label': 'Sections' }),
    h('div', { class: 'side__foot' },
      h('button', {
        class: 'btn btn--block', type: 'button', id: 'aboutbtn',
        style: 'margin-bottom:8px',
        html: `${icon('eye')}<span>About this demo</span>`,
      }),
      h('button', {
        class: 'btn btn--block', type: 'button', id: 'resetbtn',
        html: `${icon('refresh')}<span>Reset demo data</span>`,
      }),
      h('p', { class: 'hint', style: 'margin-top:10px' },
        'Sample data only. ', h('span', { class: 'kbd' }, '⌘K'), ' opens the assistant.'))),
  h('div', { class: 'main' },
    h('header', { class: 'topbar' },
      h('button', {
        class: 'btn btn--ghost btn--icon sidebtn', id: 'menubtn',
        'aria-label': 'Open navigation', 'aria-expanded': 'false', html: icon('menu'),
      }),
      h('div', { class: 'topbar__store' },
        h('span', { class: 'topbar__title', id: 'ttl' }, 'Shop'),
        h('span', { class: 'topbar__sub', id: 'sub' }, 'Storefront')),
      h('div', { class: 'spacer' }),
      h('div', { class: 'faceswitch', id: 'faceswitch', role: 'group', 'aria-label': 'Switch between the storefront and operations' }),
      h('button', {
        class: 'btn btn--ghost btn--icon cartbtn', id: 'cartbtn',
        'aria-label': 'Open cart', html: `${icon('cart')}<span class="cartbtn__count" id="cartcount" hidden>0</span>`,
      }),
      h('button', {
        class: 'pill pill--amber', type: 'button', id: 'demopill',
        style: 'cursor:pointer',
        title: 'Everything in Cartline is local sample data. Orders, stock and payments are simulated in this browser. Open for detail.',
        'aria-label': 'About this demo',
      }, 'Demo')),
    h('main', { class: 'view view--pad', id: 'view', tabindex: '-1' }))));

const sideEl = qs('#side');
const navEl = qs('#nav');
const viewEl = qs('#view');

qs('#menubtn').addEventListener('click', () => {
  const open = sideEl.classList.toggle('is-open');
  qs('#menubtn').setAttribute('aria-expanded', String(open));
});
qs('#cartbtn').addEventListener('click', () => toggleCart(ctx));

function aboutDemo() {
  modal({
    title: 'About this demo',
    width: '560px',
    body: h('div', { class: 'stack' },
      h('section', {},
        h('h4', {}, 'You can actually use it'),
        h('p', { class: 'muted small' }, 'Nothing here is read-only. Place an order on the storefront, move it across the operations board, edit a product, change a price, pause a discount code or refund an order — every screen writes to the same store the other screens read.')),
      h('section', {},
        h('h4', {}, 'Your data stays on your machine'),
        h('p', { class: 'muted small' }, `Everything you enter is saved in this browser's local storage under ${STORAGE_KEY}. Nothing is sent to a server: there is no account, no backend and no real payment. Clear your browser data, or use "Reset demo data", and it is gone. It does not sync between browsers or devices.`)),
      h('section', {},
        h('h4', {}, 'The assistant is simulated'),
        h('p', { class: 'muted small' }, 'Cartline Assist answers by matching your question against this app\'s own demo data. It is a demonstration of the interaction, not a connected model, and no request leaves your browser.'))),
    actions: [{ label: 'Close', class: 'btn--primary' }],
  });
}

qs('#demopill').addEventListener('click', aboutDemo);
qs('#aboutbtn').addEventListener('click', aboutDemo);
qs('#resetbtn').addEventListener('click', async () => {
  const ok = await confirmDialog(
    'This clears every order, product edit and discount change you made here and rebuilds the original sample data.',
    { title: 'Reset demo data', okLabel: 'Reset', danger: true },
  );
  if (!ok) return;
  store.reset();
  closeCart();
  closeOrder();
  paintView();
  syncChrome();
  toast('Demo data reset', 'ok');
});

/* ---------- navigation ---------- */

function buildNav() {
  navEl.innerHTML = '';
  FACES.forEach((face) => {
    const group = h('div', { class: 'navgroup' }, h('div', { class: 'navgroup__label' }, face.label));
    Object.entries(ROUTES).filter(([, r]) => r.face === face.id).forEach(([id, r]) => {
      group.appendChild(h('button', {
        class: 'navlink', type: 'button', dataset: { route: id },
        onclick: () => { ctx.nav(id); sideEl.classList.remove('is-open'); },
        html: `${icon(r.icon)}<span>${r.label}</span><span class="navlink__count mono" data-count="${id}"></span>`,
      }));
    });
    navEl.appendChild(group);
  });
}

function buildFaceSwitch() {
  const el = qs('#faceswitch');
  el.innerHTML = '';
  FACES.forEach((f) => {
    el.appendChild(h('button', {
      type: 'button', dataset: { face: f.id }, 'aria-pressed': 'false',
      onclick: () => ctx.nav(f.id === 'shop' ? lastOf('shop') : lastOf('ops')),
      html: `${icon(f.icon)}<span>${f.label}</span>`,
    }));
  });
}

const lastSeen = { shop: 'shop', ops: 'board' };
const lastOf = (face) => lastSeen[face] || FACES.find((f) => f.id === face).home;

function syncChrome() {
  const s = store.state;
  const count = cartCount(s);
  const badge = qs('#cartcount');
  badge.textContent = String(count);
  badge.hidden = count === 0;
  qs('#cartbtn').setAttribute('aria-label', count ? `Open cart, ${count} items` : 'Open cart');

  const counts = {
    checkout: count || '',
    board: s.orders.filter((o) => o.status === 'new').length || '',
    products: lowStock(s).length || '',
  };
  Object.entries(counts).forEach(([id, v]) => {
    const el = navEl.querySelector(`[data-count="${id}"]`);
    if (el) el.textContent = v === '' ? '' : String(v);
  });
  navEl.querySelectorAll('.navlink').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.route === current);
  });
  const face = ROUTES[current].face;
  qs('#faceswitch').querySelectorAll('button').forEach((b) => {
    const on = b.dataset.face === face;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  qs('#ttl').textContent = ROUTES[current].title;
  qs('#sub').textContent = `${s.settings.storeName} · ${ROUTES[current].sub}`;
  document.title = `${ROUTES[current].title} — Cartline`;
}

/* ---------- routing ---------- */

let params = [];
let query = new URLSearchParams();

function paintView() {
  const route = ROUTES[current];
  viewEl.innerHTML = '';
  let node;
  try {
    node = route.render(ctx, params, query);
  } catch (err) {
    node = h('div', { class: 'empty' },
      h('h3', {}, 'This screen could not be drawn'),
      h('p', {}, String(err && err.message ? err.message : err)));
  }
  viewEl.appendChild(node);
  syncChrome();
}

nav = router(
  Object.fromEntries(Object.keys(ROUTES).map((k) => [k, true])),
  (name, parts, q) => {
    current = name;
    params = parts;
    query = q;
    lastSeen[ROUTES[name].face] = name;
    closeCart();
    closeOrder();
    paintView();
    viewEl.scrollIntoView({ block: 'start' });
  },
);

buildNav();
buildFaceSwitch();
nav.go();
store.subscribe(() => syncChrome());

/* ---------- assistant ---------- */

const bot = buildAgent(ctx);
bot.mount(document.body);
ctx.bot = bot;

/* ---------- keyboard ---------- */

const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCart(); closeOrder(); sideEl.classList.remove('is-open'); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing(e.target)) return;
  if (e.key === '/') {
    const box = viewEl.querySelector('input[type="search"], .search .input, .input');
    if (box) { e.preventDefault(); box.focus(); }
    return;
  }
  if (e.key.toLowerCase() === 'c') { e.preventDefault(); toggleCart(ctx); return; }
  if (e.key.toLowerCase() === 'b') { e.preventDefault(); ctx.nav(ROUTES[current].face === 'shop' ? lastOf('ops') : lastOf('shop')); return; }
  if (/^[1-9]$/.test(e.key)) {
    const face = ROUTES[current].face;
    const ids = Object.keys(ROUTES).filter((k) => ROUTES[k].face === face);
    const target = ids[Number(e.key) - 1];
    if (target) { e.preventDefault(); ctx.nav(target); }
  }
});

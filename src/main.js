/* ============================================================
   Cartline — boot: store, shell, navigation, router, assistant.
   ============================================================ */

import { h, qs, icon, createStore, router, toast, confirmDialog, modal } from '../lib/ui.js';
import { STORAGE_KEY, seedState, dayKey, lowStock } from './data.js';
import { cartCount, toggleCart, closeCart } from './cart.js';
import { closeOrder } from './orderops.js';
import { buildAgent } from './agent.js';
import { ACTION_EXAMPLES, READ_EXAMPLES } from './actions.js';
import { createNotifications } from './notify.js';
import { createThemeButton, createDeviceSwitch, isFramed } from './chrome.js';
import { initPWA } from '../lib/pwa.js';

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

/* arrow leaving a box — the sidebar link out to the author's site */
const EXTERNAL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5h5.5V9"/><path d="M16.5 3.5L9 11"/><path d="M15 12v3.5A1.5 1.5 0 0 1 13.5 17h-9A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5H8"/></svg>';
/* code brackets — the link to this app's own source */
const SOURCE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5.5L2.5 10 7 14.5"/><path d="M13 5.5L17.5 10 13 14.5"/><path d="M11.4 3.5l-2.8 13"/></svg>';
const SOURCE_URL = 'https://github.com/nasvih/cartline-ordering-storefront-app';
/* a circle half filled, half empty — the sidebar colour control */
const TONE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none"/></svg>';
/* a panel with its side column — the collapse control */
const RAIL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8.5 4v12"/></svg>';
/* an i in a circle — the About control that replaced the DEMO pill */
const INFO_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 9v4.5"/><path d="M10 6.4h.01"/></svg>';

const app = qs('#app');
app.appendChild(h('div', { class: 'shell' },
  h('aside', { class: 'side', id: 'side' },
    h('div', { class: 'side__brand' },
      h('span', { class: 'mark' }, 'CL'),
      h('div', {},
        h('div', { class: 'side__name' }, 'Cartline'),
        h('div', { class: 'side__tag' }, 'Ordering and storefront')),
      /* the two controls that change the sidebar itself live on the sidebar */
      h('div', { class: 'side__brandbtns' },
        h('button', {
          class: 'btn', type: 'button', id: 'tonebtn', 'aria-pressed': 'false',
          html: `${TONE_ICON}<span>Sidebar colour</span>`,
        }),
        h('button', {
          class: 'btn railbtn', type: 'button', id: 'railbtn', 'aria-pressed': 'false',
          html: `${RAIL_ICON}<span>Collapse sidebar</span>`,
        }))),
    h('nav', { class: 'side__nav', id: 'nav', 'aria-label': 'Sections' }),
    h('div', { class: 'side__foot' },
      /* "About this demo" is a topbar control, not a sidebar one — it opens
         from the button beside the notifications bell. */
      h('div', { class: 'side__pair', style: 'margin-bottom:6px' },
        h('a', {
          class: 'btn sitelink', id: 'sitelink',
          href: 'https://www.nasvih.in', target: '_blank', rel: 'noopener noreferrer',
          title: 'nasvih.in — opens in a new tab',
          'aria-label': 'nasvih.in, opens in a new tab',
          html: `${EXTERNAL_ICON}<span>nasvih.in</span>`,
        }),
        h('a', {
          class: 'btn', id: 'sourcelink',
          href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer',
          title: 'GitHub — opens in a new tab',
          'aria-label': 'GitHub, opens in a new tab',
          html: `${SOURCE_ICON}<span>GitHub</span>`,
        })),
      /* the install control is added here at runtime, before Reset, and stays
         hidden until the browser offers an install — so this row is one
         full-width Reset until then, and two halves after. */
      h('div', { class: 'side__pair', id: 'footpair' },
        h('button', {
          class: 'btn', type: 'button', id: 'resetbtn',
          title: 'Reset demo data', 'aria-label': 'Reset demo data',
          html: `${icon('refresh')}<span>Reset demo data</span>`,
        })),
      h('p', { class: 'hint side__sub', id: 'sidehint', style: 'margin-top:10px' },
        'Sample data only. Nothing you enter leaves this browser.'))),
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
      h('div', { class: 'topbar__tools', id: 'tools' },
        h('button', {
          class: 'btn btn--ghost btn--icon cartbtn', id: 'cartbtn',
          'aria-label': 'Open cart', title: 'Cart',
          html: `${icon('cart')}<span class="cartbtn__count" id="cartcount" hidden>0</span>`,
        })),
      h('button', {
        class: 'btn btn--ghost aboutbtn', type: 'button', id: 'demopill',
        title: 'About this demo — everything here is local sample data, and orders, stock and payments are simulated in this browser',
        'aria-label': 'About this demo',
        html: `${INFO_ICON}<span>About this demo</span>`,
      })),
    h('main', { class: 'view view--pad', id: 'view', tabindex: '-1' }))));

const shellEl = qs('.shell');
const sideEl = qs('#side');
const navEl = qs('#nav');
const viewEl = qs('#view');

qs('#menubtn').addEventListener('click', () => {
  const open = sideEl.classList.toggle('is-open');
  qs('#menubtn').setAttribute('aria-expanded', String(open));
});

/* ---------- sidebar shape and colour ----------
   Kept in its own localStorage key so "Reset demo data" rebuilds the shop
   without also throwing away how you like the sidebar. The sidebar is yellow
   until you say otherwise; the rail only exists above 900px, because below
   that the sidebar is a full-width drawer and a 64px rail would be useless. */

const PREFS_KEY = 'cartline.chrome.v1';
const wide = window.matchMedia('(min-width:901px)');

function readPrefs() {
  const def = { rail: false, tone: 'amber' };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch (_) { return def; }
}

const prefs = readPrefs();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {} };

const railBtn = qs('#railbtn');
const toneBtn = qs('#tonebtn');

function applyPrefs() {
  const railable = wide.matches;
  shellEl.classList.toggle('is-rail', prefs.rail && railable);
  railBtn.setAttribute('aria-pressed', String(prefs.rail));
  const railLabel = prefs.rail ? 'Expand sidebar' : 'Collapse sidebar';
  railBtn.title = railLabel;
  railBtn.setAttribute('aria-label', railLabel);
  railBtn.querySelector('span').textContent = railLabel;

  /* the colour control names the setting, not the colour it would switch to,
     so its label does not change under the reader while aria-pressed does */
  const amber = prefs.tone === 'amber';
  if (amber) sideEl.dataset.tone = 'amber'; else delete sideEl.dataset.tone;
  toneBtn.setAttribute('aria-pressed', String(amber));
  toneBtn.title = 'Sidebar colour';
  toneBtn.setAttribute('aria-label', 'Sidebar colour');
}

railBtn.addEventListener('click', () => { prefs.rail = !prefs.rail; savePrefs(); applyPrefs(); });
toneBtn.addEventListener('click', () => {
  prefs.tone = prefs.tone === 'amber' ? 'plain' : 'amber';
  savePrefs();
  applyPrefs();
});
wide.addEventListener('change', applyPrefs);
applyPrefs();
qs('#cartbtn').addEventListener('click', () => toggleCart(ctx));

function aboutDemo() {
  modal({
    title: 'About this demo',
    width: '560px',
    body: h('div', { class: 'stack' },
      h('section', {},
        h('h4', {}, 'What this is'),
        h('p', { class: 'muted small' }, 'Cartline is an ordering and storefront application with two faces over one set of records. Customers browse the catalogue, fill a cart and check out on the storefront; the shop runs the day on the operations side — the order board, products and stock, discount codes and the day summary.'),
        h('p', { class: 'muted small', style: 'margin-top:6px' }, 'They are not two systems. An order placed on the storefront is the same record the board moves from new to preparing to ready, the same record that took stock down and the same record the day summary counts.')),
      h('section', {},
        h('h4', {}, 'Where it helps a business'),
        h('ul', { class: 'muted small ticks' },
          h('li', {}, 'Orders arrive as records rather than as messages, so nothing is missed at a busy hour.'),
          h('li', {}, 'The kitchen or counter works one board instead of a stack of chits.'),
          h('li', {}, 'Stock counts move as orders are placed, so what is nearly out is visible before it runs out.'),
          h('li', {}, 'Refunds carry a reason, which is what makes them reviewable later.'),
          h('li', {}, "The day's takings, average order value and best sellers are a screen rather than an evening's arithmetic."))),
      h('section', {},
        h('h4', {}, 'How it would work for real'),
        h('p', { class: 'muted small' }, 'The same interface, with browser storage swapped for a real database, a real payment provider in place of the simulated step, staff accounts so actions are attributable, and printing or a counter display for the kitchen. What you are looking at is the interface and the workflow, not the production system behind them.')),
      h('section', {},
        h('h4', {}, 'Ask the assistant to do it'),
        h('p', { class: 'muted small' }, 'Cartline Assist reads this store and changes it. Type one of these into the launcher at the bottom right; it names the exact record, shows you the before and after, and waits for you to press the button before anything is written.'),
        h('div', { class: 'exlist' }, ACTION_EXAMPLES.map((e) => h('div', { class: 'ex' },
          h('div', { class: 'ex__ask mono' }, e.ask),
          h('div', { class: 'ex__out muted small' }, e.reply)))),
        h('p', { class: 'muted small', style: 'margin-top:12px' }, 'It answers questions from the same records, with today\'s numbers rather than a canned reply:'),
        h('div', { class: 'exlist' }, READ_EXAMPLES.map((e) => h('div', { class: 'ex' },
          h('div', { class: 'ex__ask mono' }, e.ask),
          h('div', { class: 'ex__out muted small' }, e.reply))))),
      h('section', {},
        h('h4', {}, 'How this demo works'),
        h('ul', { class: 'muted small ticks' },
          h('li', {}, 'You can actually use it. Place an order, move it across the board, edit a product, change a price, pause a discount code or refund an order — every screen writes to the store the others read.'),
          h('li', {}, `Your data stays on your machine, in this browser's local storage under ${STORAGE_KEY}. There is no account and no backend. "Reset demo data" clears it, and it does not sync between browsers or devices.`),
          h('li', {}, 'The payment step is simulated. No card details are asked for, taken or sent anywhere.'),
          h('li', {}, "Cartline Assist is simulated too. It answers, and acts, by matching what you type against this app's own demo data — a demonstration of the interaction, not a connected model."),
          h('li', {}, 'The topbar carries three view controls: notifications built from the live records, a phone preview that runs the app inside a 390 by 844 frame, and a dark mode that follows your system until you pick a side.'))),
      h('section', {},
        h('p', { class: 'muted small' }, 'The source is published so it can be read and evaluated. It is not open source: copying, modifying, redistributing or reusing it needs written permission.'),
        h('a', {
          class: 'btn', style: 'margin-top:10px',
          href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer',
          'aria-label': 'GitHub, opens in a new tab',
          html: `${SOURCE_ICON}<span>GitHub</span>`,
        }))),
    actions: [{ label: 'Close', class: 'btn--primary' }],
  });
}

qs('#demopill').addEventListener('click', aboutDemo);
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
      /* title and aria-label carry the label when the sidebar is a rail and
         the text is hidden — the icon must never be the only clue. */
      group.appendChild(h('button', {
        class: 'navlink', type: 'button', dataset: { route: id },
        title: `${r.label} — ${face.label}`,
        'aria-label': `${r.label}, ${face.label}`,
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
    /* back to the top of the page, not to the top of the view — scrolling the
       view into place puts its first heading under the sticky topbar, which is
       obvious the moment the app is narrow (the phone preview shows it best) */
    window.scrollTo({ top: 0 });
  },
);

/* ---------- topbar controls ----------
   Device preview, notifications and dark mode sit together on the right of
   the topbar, after the cart. The framed copy of the app marks itself so the
   device toggle cannot be opened inside its own preview. */

if (isFramed()) document.documentElement.classList.add('is-framed');

const tools = qs('#tools');
const deviceSwitch = createDeviceSwitch({ appName: 'Cartline' });
if (deviceSwitch) tools.insertBefore(deviceSwitch, qs('#cartbtn'));
const notifications = createNotifications(ctx);
tools.appendChild(notifications.node);
tools.appendChild(createThemeButton());

buildNav();
buildFaceSwitch();
nav.go();
store.subscribe(() => { syncChrome(); notifications.sync(); });

/* ---------- installable ---------- */

const footPair = qs('#footpair');
const installBtn = initPWA({
  mount: footPair,
  appName: 'Cartline',
  onNote: (msg) => toast(msg, 'ok'),
});
/* initPWA appends; the install control belongs before Reset in the row */
if (installBtn) {
  installBtn.classList.remove('btn--block', 'btn--sm');
  footPair.insertBefore(installBtn, qs('#resetbtn'));
}

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

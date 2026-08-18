/* ============================================================
   Cartline — boot: store, shell, navigation, router, assistant.
   ============================================================ */

import {
  h, qs, icon, createStore, router, toast, confirmDialog, modal,
  setRelativeText, setDialogText,
} from '../lib/ui.js';
import { createI18n } from '../lib/i18n.js';
import { STRINGS } from './strings.js';
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

/* ---------- language ----------
   One instance for the whole app; every other module imports `t` from here.
   It has already written lang/dir onto <html> by the time this line returns —
   the inline script in index.html did it a frame earlier so nothing flashes. */
const i18n = createI18n({ key: 'cartline', dict: STRINGS });
export const t = i18n.t;
export const tlist = i18n.list;

/* The two places the shared runtime speaks for itself. */
setRelativeText({
  now: () => t('ui.relNow'),
  min: (n) => t('ui.relMin', { n }),
  hour: (n) => t('ui.relHour', { n }),
  day: (n) => t('ui.relDay', { n }),
});
setDialogText({
  title: t('ui.confirmTitle'),
  ok: t('ui.confirmOk'),
  cancel: t('ui.cancel'),
  close: t('ui.closeDialog'),
});

const store = createStore(STORAGE_KEY, seedState);

const SHOP = t('face.shop');
const OPS = t('face.ops');

const ROUTES = {
  shop: { face: 'shop', label: t('route.shop.label'), icon: 'grid', title: t('route.shop.title'), sub: SHOP, render: renderShop },
  checkout: { face: 'shop', label: t('route.checkout.label'), icon: 'cart', title: t('route.checkout.title'), sub: SHOP, render: renderCheckout },
  track: { face: 'shop', label: t('route.track.label'), icon: 'search', title: t('route.track.title'), sub: SHOP, render: renderTrack },
  board: { face: 'ops', label: t('route.board.label'), icon: 'flow', title: t('route.board.title'), sub: OPS, render: renderBoard },
  orders: { face: 'ops', label: t('route.orders.label'), icon: 'table', title: t('route.orders.title'), sub: OPS, render: renderOrders },
  products: { face: 'ops', label: t('route.products.label'), icon: 'box', title: t('route.products.title'), sub: OPS, render: renderProducts },
  discounts: { face: 'ops', label: t('route.discounts.label'), icon: 'tag', title: t('route.discounts.title'), sub: OPS, render: renderDiscounts },
  summary: { face: 'ops', label: t('route.summary.label'), icon: 'chart', title: t('route.summary.title'), sub: OPS, render: renderSummary },
  settings: { face: 'ops', label: t('route.settings.label'), icon: 'cog', title: t('route.settings.title'), sub: OPS, render: renderSettings },
};

const FACES = [
  { id: 'shop', label: SHOP, icon: 'cart', home: 'shop' },
  { id: 'ops', label: OPS, icon: 'chart', home: 'board' },
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
      h('span', { class: 'mark' }, t('app.mark')),
      h('div', {},
        h('div', { class: 'side__name' }, t('app.name')),
        h('div', { class: 'side__tag' }, t('app.tag'))),
      /* the two controls that change the sidebar itself live on the sidebar */
      h('div', { class: 'side__brandbtns' },
        h('button', {
          class: 'btn', type: 'button', id: 'tonebtn', 'aria-pressed': 'false',
          html: `${TONE_ICON}<span>${t('side.tone')}</span>`,
        }),
        h('button', {
          class: 'btn railbtn', type: 'button', id: 'railbtn', 'aria-pressed': 'false',
          html: `${RAIL_ICON}<span>${t('side.collapse')}</span>`,
        }))),
    h('nav', { class: 'side__nav', id: 'nav', 'aria-label': t('nav.sections') }),
    h('div', { class: 'side__foot' },
      /* "About this demo" is a topbar control, not a sidebar one — it opens
         from the button beside the notifications bell. */
      h('div', { class: 'side__pair', style: 'margin-bottom:6px' },
        h('a', {
          class: 'btn sitelink', id: 'sitelink',
          href: 'https://www.nasvih.in', target: '_blank', rel: 'noopener noreferrer',
          title: t('side.siteTitle'),
          'aria-label': t('side.siteAria'),
          html: `${EXTERNAL_ICON}<span>nasvih.in</span>`,
        }),
        h('a', {
          class: 'btn', id: 'sourcelink',
          href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer',
          title: t('side.githubTitle'),
          'aria-label': t('side.githubAria'),
          html: `${SOURCE_ICON}<span>${t('side.github')}</span>`,
        })),
      /* the install control is added here at runtime, before Reset, and stays
         hidden until the browser offers an install — so this row is one
         full-width Reset until then, and two halves after. */
      h('div', { class: 'side__pair', id: 'footpair' },
        h('button', {
          class: 'btn', type: 'button', id: 'resetbtn',
          title: t('side.reset'), 'aria-label': t('side.reset'),
          html: `${icon('refresh')}<span>${t('side.reset')}</span>`,
        })),
      h('p', { class: 'hint side__sub', id: 'sidehint', style: 'margin-top:10px' },
        t('side.hint')))),
  /* Below 900px the sidebar is a drawer laid over the page, and it covers the
     burger that opened it. Without a ground to tap, a touch screen has no way
     to dismiss it — Escape is a keyboard, and a phone has none. */
  h('button', {
    class: 'sidescrim', type: 'button', id: 'sidescrim', tabindex: '-1',
    'aria-label': t('side.closeNav'),
  }),
  h('div', { class: 'main' },
    h('header', { class: 'topbar' },
      h('button', {
        class: 'btn btn--ghost btn--icon sidebtn', id: 'menubtn',
        'aria-label': t('topbar.openNav'), 'aria-expanded': 'false', html: icon('menu'),
      }),
      h('div', { class: 'topbar__store' },
        h('span', { class: 'topbar__title', id: 'ttl' }, ROUTES.shop.title),
        h('span', { class: 'topbar__sub', id: 'sub' }, SHOP)),
      h('div', { class: 'spacer' }),
      h('div', { class: 'faceswitch', id: 'faceswitch', role: 'group', 'aria-label': t('face.switchAria') }),
      h('div', { class: 'topbar__tools', id: 'tools' },
        h('button', {
          class: 'btn btn--ghost btn--icon cartbtn', id: 'cartbtn',
          'aria-label': t('topbar.openCart'), title: t('topbar.cart'),
          html: `${icon('cart')}<span class="cartbtn__count" id="cartcount" hidden>0</span>`,
        })),
      h('button', {
        class: 'btn btn--ghost aboutbtn', type: 'button', id: 'demopill',
        title: t('topbar.aboutTitle'),
        'aria-label': t('topbar.about'),
        html: `${INFO_ICON}<span>${t('topbar.about')}</span>`,
      })),
    h('main', { class: 'view view--pad', id: 'view', tabindex: '-1' }))));

const shellEl = qs('.shell');
const sideEl = qs('#side');
const navEl = qs('#nav');
const viewEl = qs('#view');

function setSide(open) {
  sideEl.classList.toggle('is-open', open);
  qs('#menubtn').setAttribute('aria-expanded', String(open));
}

qs('#menubtn').addEventListener('click', () => setSide(!sideEl.classList.contains('is-open')));
qs('#sidescrim').addEventListener('click', () => setSide(false));

/* ---------- sidebar shape and colour ----------
   Kept in its own localStorage key so "Reset demo data" rebuilds the shop
   without also throwing away how you like the sidebar. The sidebar is terracotta
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
  const railLabel = prefs.rail ? t('side.expand') : t('side.collapse');
  railBtn.title = railLabel;
  railBtn.setAttribute('aria-label', railLabel);
  railBtn.querySelector('span').textContent = railLabel;

  /* the colour control names the setting, not the colour it would switch to,
     so its label does not change under the reader while aria-pressed does */
  const amber = prefs.tone === 'amber';
  if (amber) sideEl.dataset.tone = 'amber'; else delete sideEl.dataset.tone;
  toneBtn.setAttribute('aria-pressed', String(amber));
  toneBtn.title = t('side.tone');
  toneBtn.setAttribute('aria-label', t('side.tone'));
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
    title: t('about.title'),
    width: '560px',
    body: h('div', { class: 'stack' },
      h('section', {},
        h('h4', {}, t('about.whatH')),
        h('p', { class: 'muted small' }, t('about.whatP1')),
        h('p', { class: 'muted small', style: 'margin-top:6px' }, t('about.whatP2'))),
      h('section', {},
        h('h4', {}, t('about.helpsH')),
        h('ul', { class: 'muted small ticks' },
          h('li', {}, t('about.helps1')),
          h('li', {}, t('about.helps2')),
          h('li', {}, t('about.helps3')),
          h('li', {}, t('about.helps4')),
          h('li', {}, t('about.helps5')))),
      h('section', {},
        h('h4', {}, t('about.realH')),
        h('p', { class: 'muted small' }, t('about.realP'))),
      h('section', {},
        h('h4', {}, t('about.askH')),
        h('p', { class: 'muted small' }, t('about.askP')),
        h('div', { class: 'exlist' }, ACTION_EXAMPLES().map((e) => h('div', { class: 'ex' },
          h('div', { class: 'ex__ask mono' }, e.ask),
          h('div', { class: 'ex__out muted small' }, e.reply)))),
        h('p', { class: 'muted small', style: 'margin-top:12px' }, t('about.readsP')),
        h('div', { class: 'exlist' }, READ_EXAMPLES().map((e) => h('div', { class: 'ex' },
          h('div', { class: 'ex__ask mono' }, e.ask),
          h('div', { class: 'ex__out muted small' }, e.reply))))),
      h('section', {},
        h('h4', {}, t('about.worksH')),
        h('ul', { class: 'muted small ticks' },
          h('li', {}, t('about.works1')),
          h('li', {}, t('about.works2', { key: STORAGE_KEY })),
          h('li', {}, t('about.works3')),
          h('li', {}, t('about.works4')),
          h('li', {}, t('about.works5')))),
      h('section', {},
        h('p', { class: 'muted small' }, t('about.licenceP')),
        h('a', {
          class: 'btn', style: 'margin-top:10px',
          href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer',
          'aria-label': t('side.githubAria'),
          html: `${SOURCE_ICON}<span>${t('side.github')}</span>`,
        }))),
    actions: [{ label: t('common.close'), class: 'btn--primary' }],
  });
}

qs('#demopill').addEventListener('click', aboutDemo);
qs('#resetbtn').addEventListener('click', async () => {
  const ok = await confirmDialog(
    t('reset.body'),
    { title: t('reset.title'), okLabel: t('reset.ok'), danger: true },
  );
  if (!ok) return;
  store.reset();
  closeCart();
  closeOrder();
  paintView();
  syncChrome();
  toast(t('reset.done'), 'ok');
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
        title: t('nav.title', { label: r.label, face: face.label }),
        'aria-label': t('nav.aria', { label: r.label, face: face.label }),
        onclick: () => { ctx.nav(id); setSide(false); },
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
  qs('#cartbtn').setAttribute('aria-label', count ? t('topbar.openCartN', { n: count }) : t('topbar.openCart'));

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
  document.title = t('app.docTitle', { title: ROUTES[current].title });
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
      h('h3', {}, t('app.drawFail')),
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
const deviceSwitch = createDeviceSwitch({ appName: t('app.name') });
if (deviceSwitch) tools.insertBefore(deviceSwitch, qs('#cartbtn'));
const notifications = createNotifications(ctx);
tools.appendChild(notifications.node);
/* Language, then theme, then the device preview the switch already added:
   the control that changes what every other control says goes first. */
tools.appendChild(i18n.toggle());
tools.appendChild(createThemeButton());

buildNav();
buildFaceSwitch();
nav.go();
store.subscribe(() => { syncChrome(); notifications.sync(); });

/* ---------- installable ---------- */

const footPair = qs('#footpair');
const installBtn = initPWA({
  mount: footPair,
  appName: t('app.name'),
  onNote: (msg) => toast(msg, 'ok'),
  labels: {
    install: t('pwa.install'),
    title: (app) => t('pwa.title', { app }),
    installed: (app) => t('pwa.installed', { app }),
    dismissed: t('pwa.dismissed'),
    ios: t('pwa.ios'),
    menu: t('pwa.menu'),
  },
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
  if (e.key === 'Escape') { closeCart(); closeOrder(); setSide(false); return; }
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

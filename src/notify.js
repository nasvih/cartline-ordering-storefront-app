/* ============================================================
   Notifications — built from the store, not stored as messages.

   There is no message table anywhere in this app. The list below is derived
   from the same records the screens draw: an order sitting in new, an order
   past the prep promise, a product at or below the low-stock line, a refund
   taken today. That means it can never go stale — restock a product and its
   notice disappears, take an order on the storefront and one appears.

   What *is* stored is which notices have been read, keyed by a stable id, in
   localStorage under cartline.notifications.v1.
   ============================================================ */

import { h, icon, money, num, ago } from '../lib/ui.js';
import { dayKey, lowStock, STATUSES } from './data.js';
import { t } from './main.js';
import { tr } from './strings.js';

const KEY = 'cartline.notifications.v1';
const CAP = 24;

function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return { read: Array.isArray(v && v.read) ? v.read : [] };
  } catch (_) { return { read: [] }; }
}

function writeState(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ read: s.read.slice(-200) })); } catch (_) {}
}

/** Everything that wants attention right now, most urgent first. */
export function feed(state) {
  const items = [];
  const today = dayKey(new Date());
  const prep = state.settings.prepMinutes;
  const late = new Set();

  state.orders.forEach((o) => {
    if (!STATUSES.includes(o.status) || o.status === 'completed') return;
    const mins = Math.round((Date.now() - new Date(o.placedAt).getTime()) / 60000);
    if (mins > prep) {
      late.add(o.id);
      items.push({
        id: `late-${o.id}`,
        rank: 'Late',
        kind: t('notify.kindLate'),
        tone: 'warn',
        title: t('notify.lateTitle', { no: o.no, mins: num(mins) }),
        body: t('notify.lateBody', { status: t(`data.statusRaw.${o.status}`), customer: o.customer, prep: num(prep) }),
        at: o.placedAt,
        route: 'board',
      });
    }
  });

  state.orders.forEach((o) => {
    if (o.status !== 'new' || late.has(o.id)) return;
    items.push({
      id: `new-${o.id}`,
      rank: 'New order',
      kind: t('notify.kindNew'),
      tone: 'info',
      title: t('notify.newTitle', { no: o.no }),
      body: t('notify.newBody', { customer: o.customer, channel: t(`data.channel.${o.channel}`), money: money(o.total, state.settings.currency) }),
      at: o.placedAt,
      route: 'board',
    });
  });

  lowStock(state).slice(0, 6).forEach((p) => {
    items.push({
      id: `stock-${p.id}`,
      rank: p.stock === 0 ? 'Out of stock' : 'Low stock',
      kind: p.stock === 0 ? t('notify.kindOut') : t('notify.kindLow'),
      tone: p.stock === 0 ? 'bad' : 'warn',
      title: p.stock === 0 ? t('notify.outTitle', { name: p.name }) : t('notify.lowTitle', { name: p.name, n: num(p.stock) }),
      body: t('notify.stockBody', { sku: p.sku, limit: num(state.settings.lowStockAt) }),
      at: null,
      route: 'products',
    });
  });

  state.orders.forEach((o) => {
    if (o.status !== 'refunded' || !o.refund) return;
    if (dayKey(o.refund.at || o.placedAt) !== today) return;
    items.push({
      id: `refund-${o.id}`,
      rank: 'Refund',
      kind: t('notify.kindRefund'),
      tone: 'bad',
      title: t('notify.refundTitle', { no: o.no, money: money(o.refund.amount, state.settings.currency) }),
      body: t('notify.refundBody', { customer: o.customer, reason: tr('refundReason', o.refund.reason) }),
      at: o.refund.at,
      route: 'orders',
    });
  });

  /* Urgency first, then time inside each band: a late order matters more than
     a low shelf, and a low shelf more than a refund already dealt with. */
  const RANK = { Late: 0, 'New order': 1, 'Out of stock': 2, 'Low stock': 3, Refund: 4 };
  const stamp = (n) => (n.at ? new Date(n.at).getTime() : Date.now());
  return items
    .sort((a, b) => (RANK[a.rank] - RANK[b.rank]) || (stamp(b) - stamp(a)))
    .slice(0, CAP);
}

/**
 * The bell, its unread count and the panel under it.
 * Returns { button, sync } — main.js drops the button into the topbar and
 * calls sync() whenever the store changes.
 */
export function createNotifications(ctx) {
  let prefs = readState();
  let open = false;

  const badge = h('span', { class: 'cartbtn__count', id: 'notifcount', hidden: true }, '0');
  const button = h('button', {
    class: 'btn btn--ghost btn--icon cartbtn', type: 'button',
    'aria-label': t('notify.aria'), title: t('notify.title'),
    'aria-expanded': 'false', 'aria-haspopup': 'dialog',
    html: icon('bell'),
  });
  button.appendChild(badge);

  const panel = h('div', {
    class: 'notifpanel', role: 'dialog', 'aria-label': t('notify.title'), hidden: true,
  });
  const wrap = h('div', { class: 'notifwrap' }, button, panel);

  const unreadOf = (list) => list.filter((n) => !prefs.read.includes(n.id));

  function markRead(ids) {
    const add = ids.filter((id) => !prefs.read.includes(id));
    if (!add.length) return;
    prefs = { read: [...prefs.read, ...add] };
    writeState(prefs);
  }

  function paint() {
    const list = feed(ctx.state);
    const unread = unreadOf(list);
    panel.innerHTML = '';
    panel.appendChild(h('header', { class: 'notifpanel__head' },
      h('h3', { style: 'flex:1' }, t('notify.title')),
      h('span', { class: `pill${unread.length ? ' pill--amber' : ''} mono` }, unread.length ? t('notify.newPill', { n: num(unread.length) }) : t('notify.allRead')),
      unread.length ? h('button', {
        class: 'btn btn--sm', type: 'button',
        onclick: () => { markRead(list.map((n) => n.id)); paint(); sync(); },
      }, t('notify.markAll')) : null));

    const body = h('div', { class: 'notiflist' });
    if (!list.length) {
      body.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('notify.emptyH')),
        h('p', {}, t('notify.emptyP'))));
    } else {
      list.forEach((n) => {
        const isUnread = !prefs.read.includes(n.id);
        const row = h('div', { class: `notif${isUnread ? ' is-unread' : ''}` },
          h('button', {
            class: 'notif__main', type: 'button',
            'aria-label': t('notify.openAria', { title: n.title, body: n.body, route: t(`route.${n.route}.label`) }),
            onclick: () => { markRead([n.id]); close(); ctx.nav(n.route); },
          },
          h('span', { class: 'notif__top' },
            h('span', { class: `pill pill--${n.tone}` }, n.kind),
            h('span', { class: 'notif__when mono' }, n.at ? ago(n.at) : t('notify.now'))),
          h('span', { class: 'notif__title' }, n.title),
          h('span', { class: 'notif__body' }, n.body)),
          isUnread ? h('button', {
            class: 'btn btn--ghost btn--icon notif__read', type: 'button',
            title: t('notify.markOne'), 'aria-label': t('notify.markOneAria', { title: n.title }),
            onclick: () => { markRead([n.id]); paint(); sync(); },
            html: icon('check'),
          }, null) : null);
        body.appendChild(row);
      });
    }
    panel.appendChild(body);
    panel.appendChild(h('p', { class: 'notifpanel__foot hint' },
      t('notify.foot')));
  }

  function sync() {
    const unread = unreadOf(feed(ctx.state));
    badge.textContent = String(unread.length);
    badge.hidden = unread.length === 0;
    button.setAttribute('aria-label', unread.length ? t('notify.unreadAria', { n: unread.length }) : t('notify.noneAria'));
    button.title = unread.length ? t('notify.unreadTitle', { n: unread.length }) : t('notify.title');
  }

  function close() {
    if (!open) return;
    open = false;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    open = !open;
    if (open) paint();
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = panel.querySelector('button');
      if (first) first.focus();
    }
  }

  button.addEventListener('click', toggle);
  /* Marking one notice read repaints the list, which detaches the button that
     was clicked — so by the time this listener runs, wrap.contains(target) is
     false and the panel would close under the reader. The event path is fixed
     at dispatch, so ask that instead. */
  document.addEventListener('click', (e) => {
    if (!open) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (path.includes(wrap) || wrap.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { close(); button.focus(); }
  });

  sync();
  return { node: wrap, sync, close };
}

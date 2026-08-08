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
        kind: 'Late',
        tone: 'warn',
        title: `${o.no} is ${num(mins)} minutes old`,
        body: `Still ${o.status} · ${o.customer} · past the ${num(prep)} minute promise`,
        at: o.placedAt,
        route: 'board',
      });
    }
  });

  state.orders.forEach((o) => {
    if (o.status !== 'new' || late.has(o.id)) return;
    items.push({
      id: `new-${o.id}`,
      kind: 'New order',
      tone: 'info',
      title: `${o.no} is waiting to be started`,
      body: `${o.customer} · ${o.channel} · ${money(o.total, state.settings.currency)}`,
      at: o.placedAt,
      route: 'board',
    });
  });

  lowStock(state).slice(0, 6).forEach((p) => {
    items.push({
      id: `stock-${p.id}`,
      kind: p.stock === 0 ? 'Out of stock' : 'Low stock',
      tone: p.stock === 0 ? 'bad' : 'warn',
      title: p.stock === 0 ? `${p.name} is out of stock` : `${p.name} is down to ${num(p.stock)}`,
      body: `${p.sku} · the low-stock line is ${num(state.settings.lowStockAt)} units`,
      at: null,
      route: 'products',
    });
  });

  state.orders.forEach((o) => {
    if (o.status !== 'refunded' || !o.refund) return;
    if (dayKey(o.refund.at || o.placedAt) !== today) return;
    items.push({
      id: `refund-${o.id}`,
      kind: 'Refund',
      tone: 'bad',
      title: `${o.no} refunded ${money(o.refund.amount, state.settings.currency)}`,
      body: `${o.customer} · ${o.refund.reason}`,
      at: o.refund.at,
      route: 'orders',
    });
  });

  /* Urgency first, then time inside each band: a late order matters more than
     a low shelf, and a low shelf more than a refund already dealt with. */
  const RANK = { Late: 0, 'New order': 1, 'Out of stock': 2, 'Low stock': 3, Refund: 4 };
  const stamp = (n) => (n.at ? new Date(n.at).getTime() : Date.now());
  return items
    .sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || (stamp(b) - stamp(a)))
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
    'aria-label': 'Notifications', title: 'Notifications',
    'aria-expanded': 'false', 'aria-haspopup': 'dialog',
    html: icon('bell'),
  });
  button.appendChild(badge);

  const panel = h('div', {
    class: 'notifpanel', role: 'dialog', 'aria-label': 'Notifications', hidden: true,
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
      h('h3', { style: 'flex:1' }, 'Notifications'),
      h('span', { class: `pill${unread.length ? ' pill--amber' : ''} mono` }, unread.length ? `${num(unread.length)} new` : 'All read'),
      unread.length ? h('button', {
        class: 'btn btn--sm', type: 'button',
        onclick: () => { markRead(list.map((n) => n.id)); paint(); sync(); },
      }, 'Mark all read') : null));

    const body = h('div', { class: 'notiflist' });
    if (!list.length) {
      body.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'Nothing needs attention'),
        h('p', {}, 'No order is waiting or late, nothing is under the low-stock line and no refund has gone through today.')));
    } else {
      list.forEach((n) => {
        const isUnread = !prefs.read.includes(n.id);
        const row = h('div', { class: `notif${isUnread ? ' is-unread' : ''}` },
          h('button', {
            class: 'notif__main', type: 'button',
            'aria-label': `${n.title}. ${n.body}. Open ${n.route}`,
            onclick: () => { markRead([n.id]); close(); ctx.nav(n.route); },
          },
          h('span', { class: 'notif__top' },
            h('span', { class: `pill pill--${n.tone}` }, n.kind),
            h('span', { class: 'notif__when mono' }, n.at ? ago(n.at) : 'now')),
          h('span', { class: 'notif__title' }, n.title),
          h('span', { class: 'notif__body' }, n.body)),
          isUnread ? h('button', {
            class: 'btn btn--ghost btn--icon notif__read', type: 'button',
            title: 'Mark as read', 'aria-label': `Mark "${n.title}" as read`,
            onclick: () => { markRead([n.id]); paint(); sync(); },
            html: icon('check'),
          }, null) : null);
        body.appendChild(row);
      });
    }
    panel.appendChild(body);
    panel.appendChild(h('p', { class: 'notifpanel__foot hint' },
      'Built from the live demo data — place an order or restock a product and this list changes with it.'));
  }

  function sync() {
    const unread = unreadOf(feed(ctx.state));
    badge.textContent = String(unread.length);
    badge.hidden = unread.length === 0;
    button.setAttribute('aria-label', unread.length ? `Notifications, ${unread.length} unread` : 'Notifications, none unread');
    button.title = unread.length ? `${unread.length} unread notifications` : 'Notifications';
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

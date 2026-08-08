/* ============================================================
   Order operations shared by the board and the orders table:
   status moves, the detail drawer, cancels and refunds.
   ============================================================ */

import { h, icon, money, modal, toast, confirmDialog, fmtTime, fmtDate, ago } from '../lib/ui.js';
import { STATUSES, REFUND_REASONS } from './data.js';
import { initialsOf } from './cart.js';
import { pillClass } from './views/track.js';

export const STEP_LABEL = { new: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', refunded: 'Refunded', cancelled: 'Cancelled' };
const MOVE_LABEL = { preparing: 'Moved to preparing', ready: 'Marked ready', completed: 'Handed over', cancelled: 'Cancelled at the counter' };

export const nextStatus = (status) => {
  const i = STATUSES.indexOf(status);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
};

export function setStatus(ctx, orderId, status) {
  const at = new Date().toISOString();
  ctx.store.update((s) => {
    const o = s.orders.find((x) => x.id === orderId);
    if (!o) return;
    o.status = status;
    o.updatedAt = at;
    o.timeline.push({ at, label: MOVE_LABEL[status] || `Set to ${status}`, by: s.settings.counterName });
  });
}

export function advance(ctx, order) {
  const next = nextStatus(order.status);
  if (!next) { toast(`${order.no} is already completed`, ''); return; }
  setStatus(ctx, order.id, next);
  toast(`${order.no} → ${STEP_LABEL[next].toLowerCase()}`, 'ok');
}

export async function cancelOrder(ctx, order) {
  const ok = await confirmDialog(
    `Cancel ${order.no} for ${order.customer}? Nothing was charged in this demo, and the items go back into stock.`,
    { title: 'Cancel order', okLabel: 'Cancel order', danger: true },
  );
  if (!ok) return false;
  const at = new Date().toISOString();
  ctx.store.update((s) => {
    const o = s.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.status = 'cancelled';
    o.updatedAt = at;
    o.timeline.push({ at, label: 'Cancelled at the counter', by: s.settings.counterName });
    o.items.forEach((it) => {
      const p = s.products.find((x) => x.id === it.productId);
      if (p) p.stock += it.qty;
    });
  });
  toast(`${order.no} cancelled`, '');
  return true;
}

export function refundOrder(ctx, order, done) {
  if (order.status === 'refunded') { toast(`${order.no} was already refunded`, ''); return; }
  const amount = h('input', {
    class: 'input', type: 'number', min: '1', max: String(order.total), value: String(order.total), 'aria-label': 'Refund amount',
  });
  const reason = h('select', { class: 'select', 'aria-label': 'Refund reason' },
    ...REFUND_REASONS.map((r) => h('option', { value: r }, r)));
  const note = h('textarea', { class: 'textarea', placeholder: 'Anything the day summary should carry', 'aria-label': 'Refund note' });
  const restock = h('input', { type: 'checkbox', checked: true });

  const m = modal({
    title: `Refund ${order.no}`,
    body: h('div', {},
      h('p', { class: 'muted small', style: 'margin-bottom:14px' },
        `${order.customer} paid ${money(order.total, ctx.currency())} by ${order.payment}. A refund takes the value off today's net revenue and marks the order refunded.`),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, `Amount (${ctx.currency()})`), amount),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Reason'), reason),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Note'), note),
      h('label', { class: 'switch', style: 'margin-top:14px' }, restock, h('span', { class: 'switch__track' }), h('span', {}, 'Put the items back into stock'))),
    actions: [
      { label: 'Close' },
      {
        label: 'Refund',
        class: 'btn--danger',
        onClick: () => {
          const value = Math.max(1, Math.min(Number(amount.value) || 0, order.total));
          confirmDialog(
            `Refund ${ctx.currency()}${value} on ${order.no}? This cannot be undone from the board — only a demo reset brings it back.`,
            { title: 'Confirm refund', okLabel: `Refund ${ctx.currency()}${value}`, danger: true },
          ).then((ok) => {
            if (!ok) return;
            const at = new Date().toISOString();
            ctx.store.update((s) => {
              const o = s.orders.find((x) => x.id === order.id);
              if (!o) return;
              o.status = 'refunded';
              o.updatedAt = at;
              o.refund = { amount: value, reason: reason.value, note: note.value.trim(), at, by: s.settings.counterName };
              o.timeline.push({ at, label: `Refunded ${s.settings.currency}${value}`, by: s.settings.counterName });
              if (restock.checked) {
                o.items.forEach((it) => {
                  const p = s.products.find((x) => x.id === it.productId);
                  if (p) p.stock += it.qty;
                });
              }
            });
            m.close();
            toast(`${order.no} refunded`, 'bad');
            if (done) done();
          });
          return true;
        },
      },
    ],
  });
}

/* ---------- detail drawer ---------- */

let openEl = null;
export function closeOrder() { if (openEl) { openEl.remove(); openEl = null; } }

export function openOrder(ctx, orderId, onChange) {
  closeOrder();
  const scrim = h('div', { class: 'scrim', style: 'place-items:stretch;padding:0' });
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Order detail' });
  scrim.appendChild(drawer);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeOrder(); });
  document.body.appendChild(scrim);
  openEl = scrim;

  const refresh = () => { paint(); if (onChange) onChange(); };

  function paint() {
    const o = ctx.state.orders.find((x) => x.id === orderId);
    drawer.innerHTML = '';
    if (!o) { closeOrder(); return; }

    drawer.appendChild(h('header', { class: 'drawer__head' },
      h('h3', { class: 'mono', style: 'flex:1' }, o.no),
      h('span', { class: `pill ${pillClass(o.status)}` }, STEP_LABEL[o.status]),
      h('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'Close order detail', onclick: closeOrder, html: icon('x') })));

    const body = h('div', { class: 'drawer__body' });
    body.appendChild(h('dl', { class: 'kv' },
      h('dt', {}, 'Customer'), h('dd', {}, o.customer),
      h('dt', {}, 'Collection'), h('dd', {}, o.channel + (o.area ? ` · ${o.area}` : '')),
      h('dt', {}, 'Placed'), h('dd', {}, `${fmtDate(o.placedAt)} ${fmtTime(o.placedAt)} · ${ago(o.placedAt)}`),
      h('dt', {}, 'Payment'), h('dd', {}, o.payment),
      h('dt', {}, 'Handled by'), h('dd', {}, o.handledBy),
      o.note ? h('dt', {}, 'Note') : null, o.note ? h('dd', {}, o.note) : null));

    if (o.refund) {
      body.appendChild(h('div', { class: 'banner', style: 'margin-top:14px' },
        h('span', { html: icon('alert') }),
        h('div', {},
          h('strong', {}, `Refunded ${money(o.refund.amount, ctx.currency())} · ${fmtTime(o.refund.at)}. `),
          o.refund.reason,
          o.refund.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, o.refund.note) : null)));
    }

    body.appendChild(h('hr', { class: 'hr' }));
    body.appendChild(h('h4', { style: 'margin-bottom:8px' }, 'Items'));
    o.items.forEach((it) => body.appendChild(h('div', { class: 'cartline' },
      h('span', { class: 'tile tile--sm tone-6' }, initialsOf(it.name)),
      h('div', { class: 'cartline__main' },
        h('div', { class: 'cartline__name' }, it.name),
        h('div', { class: 'small muted mono' }, `${it.qty} × ${money(it.price, ctx.currency())}`)),
      h('div', { class: 'mono', style: 'font-weight:600' }, money(it.price * it.qty, ctx.currency())))));

    body.appendChild(h('div', { class: 'totals' },
      trow('Subtotal', money(o.subtotal, ctx.currency())),
      o.discountAmt ? trow(`Discount ${o.discountCode}`, `− ${money(o.discountAmt, ctx.currency())}`) : null,
      trow('Tax', money(o.tax, ctx.currency())),
      h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, 'Total'), h('strong', {}, money(o.total, ctx.currency())))));

    body.appendChild(h('hr', { class: 'hr' }));
    body.appendChild(h('h4', { style: 'margin-bottom:10px' }, 'Timeline'));
    body.appendChild(h('div', { class: 'timeline' }, o.timeline.map((t) => h('div', { class: 'timeline__item' },
      h('div', { style: 'font-weight:600;font-size:13.5px' }, t.label),
      h('div', { class: 'small faint mono' }, `${fmtTime(t.at)} · ${t.by}`)))));
    drawer.appendChild(body);

    const next = nextStatus(o.status);
    drawer.appendChild(h('div', { class: 'drawer__foot' },
      h('div', { class: 'btnrow' },
        next ? h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { advance(ctx, o); refresh(); },
        }, `Move to ${STEP_LABEL[next].toLowerCase()}`) : null,
        o.status !== 'refunded' && o.status !== 'cancelled' ? h('button', {
          class: 'btn btn--danger', type: 'button',
          onclick: () => refundOrder(ctx, o, refresh),
        }, 'Refund') : null,
        o.status === 'new' ? h('button', {
          class: 'btn btn--ghost', type: 'button',
          onclick: () => cancelOrder(ctx, o).then((ok) => { if (ok) refresh(); }),
        }, 'Cancel order') : null)));
  }

  paint();
  return { close: closeOrder, repaint: paint };
}

function trow(label, value) {
  return h('div', { class: 'totals__row' }, h('span', {}, label), h('strong', {}, value));
}

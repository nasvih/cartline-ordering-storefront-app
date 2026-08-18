/* ============================================================
   Order operations shared by the board and the orders table:
   status moves, the detail drawer, cancels and refunds.
   ============================================================ */

import { h, icon, money, modal, toast, confirmDialog, fmtTime, fmtDate, ago } from '../lib/ui.js';
import { STATUSES, REFUND_REASONS } from './data.js';
import { tile } from './cart.js';
import { pillClass } from './views/track.js';
import { t } from './main.js';
import { tr, trTimeline } from './strings.js';

/* The board's word for each stage, in the reader's language. A function, not
   a constant: the dictionary is not loaded when this module is evaluated. */
export const STEP_LABEL = (status) => t(`data.status.${status}`);
/* What goes *into* the record stays canonical English, so a store filled in
   one language reads correctly in the other. trTimeline() turns it back. */
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
  if (!next) { toast(t('orderops.already', { no: order.no }), ''); return; }
  setStatus(ctx, order.id, next);
  toast(t('orderops.moved', { no: order.no, stage: t(`data.statusRaw.${next}`) }), 'ok');
}

export async function cancelOrder(ctx, order) {
  const ok = await confirmDialog(
    t('orderops.cancelBody', { no: order.no, customer: order.customer }),
    { title: t('orderops.cancelTitle'), okLabel: t('orderops.cancelOk'), danger: true },
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
  toast(t('orderops.cancelled', { no: order.no }), '');
  return true;
}

export function refundOrder(ctx, order, done) {
  if (order.status === 'refunded') { toast(t('orderops.alreadyRefunded', { no: order.no }), ''); return; }
  const amount = h('input', {
    class: 'input', type: 'number', min: '1', max: String(order.total), value: String(order.total), 'aria-label': t('orderops.amountAria'),
  });
  const reason = h('select', { class: 'select', 'aria-label': t('orderops.reasonAria') },
    ...REFUND_REASONS.map((r) => h('option', { value: r }, tr('refundReason', r))));
  const note = h('textarea', { class: 'textarea', placeholder: t('orderops.notePh'), 'aria-label': t('orderops.noteAria') });
  const restock = h('input', { type: 'checkbox', checked: true });

  const m = modal({
    title: t('orderops.refundTitle', { no: order.no }),
    body: h('div', {},
      h('p', { class: 'muted small', style: 'margin-bottom:14px' },
        t('orderops.refundIntro', {
          customer: order.customer,
          money: money(order.total, ctx.currency()),
          payment: t(`data.payment.${order.payment}`),
        })),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('orderops.amount', { cur: ctx.currency() })), amount),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('orderops.reason')), reason),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('orderops.note')), note),
      h('label', { class: 'switch', style: 'margin-top:14px' }, restock, h('span', { class: 'switch__track' }), h('span', {}, t('orderops.restock')))),
    actions: [
      { label: t('common.close') },
      {
        label: t('orderops.refund'),
        class: 'btn--danger',
        onClick: () => {
          const value = Math.max(1, Math.min(Number(amount.value) || 0, order.total));
          confirmDialog(
            t('orderops.confirmBody', { money: `${ctx.currency()}${value}`, no: order.no }),
            { title: t('orderops.confirmTitle'), okLabel: t('orderops.confirmOk', { money: `${ctx.currency()}${value}` }), danger: true },
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
            toast(t('orderops.refunded', { no: order.no }), 'bad');
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
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': t('orderops.detailAria') });
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
      h('span', { class: `pill ${pillClass(o.status)}` }, STEP_LABEL(o.status)),
      h('button', { class: 'btn btn--ghost btn--icon', 'aria-label': t('orderops.closeDetail'), onclick: closeOrder, html: icon('x') })));

    const body = h('div', { class: 'drawer__body' });
    body.appendChild(h('dl', { class: 'kv' },
      h('dt', {}, t('common.customer')), h('dd', {}, o.customer),
      h('dt', {}, t('common.collection')), h('dd', {}, t(`data.channel.${o.channel}`) + (o.area ? ` · ${tr('area', o.area)}` : '')),
      h('dt', {}, t('common.placed')), h('dd', {}, `${fmtDate(o.placedAt)} ${fmtTime(o.placedAt)} · ${ago(o.placedAt)}`),
      h('dt', {}, t('common.payment')), h('dd', {}, t(`data.payment.${o.payment}`)),
      h('dt', {}, t('orderops.handledBy')), h('dd', {}, tr('by', o.handledBy)),
      o.note ? h('dt', {}, t('common.note')) : null, o.note ? h('dd', {}, tr('orderNote', o.note)) : null));

    if (o.refund) {
      body.appendChild(h('div', { class: 'banner', style: 'margin-top:14px' },
        h('span', { html: icon('alert') }),
        h('div', {},
          h('strong', {}, t('orderops.refundedAt', { money: money(o.refund.amount, ctx.currency()), time: fmtTime(o.refund.at) })),
          tr('refundReason', o.refund.reason),
          o.refund.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, o.refund.note) : null)));
    }

    body.appendChild(h('hr', { class: 'hr' }));
    body.appendChild(h('h4', { style: 'margin-bottom:8px' }, t('orderops.items')));
    o.items.forEach((it) => body.appendChild(h('div', { class: 'cartline' },
      tile({ productId: it.productId, name: it.name, tone: 6 }, 'tile--sm'),
      h('div', { class: 'cartline__main' },
        h('div', { class: 'cartline__name' }, it.name),
        h('div', { class: 'small muted mono' }, `${it.qty} × ${money(it.price, ctx.currency())}`)),
      h('div', { class: 'mono', style: 'font-weight:600' }, money(it.price * it.qty, ctx.currency())))));

    body.appendChild(h('div', { class: 'totals' },
      trow(t('common.subtotal'), money(o.subtotal, ctx.currency())),
      o.discountAmt ? trow(t('cart.discountRow', { code: o.discountCode }), `− ${money(o.discountAmt, ctx.currency())}`) : null,
      trow(t('common.tax'), money(o.tax, ctx.currency())),
      h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, t('common.total')), h('strong', {}, money(o.total, ctx.currency())))));

    body.appendChild(h('hr', { class: 'hr' }));
    body.appendChild(h('h4', { style: 'margin-bottom:10px' }, t('orderops.timeline')));
    body.appendChild(h('div', { class: 'timeline' }, o.timeline.map((e) => h('div', { class: 'timeline__item' },
      h('div', { style: 'font-weight:600;font-size:13.5px' }, trTimeline(e.label)),
      h('div', { class: 'small faint mono' }, `${fmtTime(e.at)} · ${tr('by', e.by)}`)))));
    drawer.appendChild(body);

    const next = nextStatus(o.status);
    drawer.appendChild(h('div', { class: 'drawer__foot' },
      h('div', { class: 'btnrow' },
        next ? h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { advance(ctx, o); refresh(); },
        }, t('orderops.moveTo', { stage: t(`data.statusRaw.${next}`) })) : null,
        o.status !== 'refunded' && o.status !== 'cancelled' ? h('button', {
          class: 'btn btn--danger', type: 'button',
          onclick: () => refundOrder(ctx, o, refresh),
        }, t('orderops.refund')) : null,
        o.status === 'new' ? h('button', {
          class: 'btn btn--ghost', type: 'button',
          onclick: () => cancelOrder(ctx, o).then((ok) => { if (ok) refresh(); }),
        }, t('orderops.cancelTitle')) : null)));
  }

  paint();
  return { close: closeOrder, repaint: paint };
}

function trow(label, value) {
  return h('div', { class: 'totals__row' }, h('span', {}, label), h('strong', {}, value));
}

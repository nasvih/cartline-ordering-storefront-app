/* Storefront — look up an order by its number and watch its status. */

import { h, icon, money, fmtTime, fmtDate, ago } from '../../lib/ui.js';
import { STATUSES, orderByNo, dayKey } from '../data.js';
import { tile } from '../cart.js';

const STEP_LABEL = {
  new: 'Received', preparing: 'Preparing', ready: 'Ready', completed: 'Handed over',
  refunded: 'Refunded', cancelled: 'Cancelled',
};

export default function renderTrack(ctx, params, query) {
  const wrap = h('div', {});
  const startNo = (query && query.get('no')) || ctx.state.lastOrderNo || '';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Track an order'),
      h('p', {}, 'Type an order number such as CL-1052. The status here is the same record the counter works from on the operations board.'))));

  const input = h('input', {
    class: 'input', placeholder: 'Order number', 'aria-label': 'Order number', value: startNo,
  });
  const out = h('div', { style: 'margin-top:18px' });

  const look = () => {
    const raw = input.value.trim();
    out.innerHTML = '';
    if (!raw) {
      out.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'Enter an order number'),
        h('p', {}, 'Every order placed at checkout gets one. Recent numbers are listed below.')));
      return;
    }
    const o = orderByNo(ctx.state, raw);
    if (!o) {
      out.appendChild(h('div', { class: 'empty' },
        h('h3', {}, `Nothing found for ${raw}`),
        h('p', {}, 'Check the number, or pick one of the recent orders below.')));
      return;
    }
    out.appendChild(detail(ctx, o));
  };

  wrap.appendChild(h('div', { class: 'card' },
    h('div', { class: 'row' },
      h('div', { class: 'search', style: 'max-width:280px' }, h('span', { html: icon('search') }), input),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: look }, 'Find order'))));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') look(); });

  wrap.appendChild(out);

  const recent = ctx.state.orders.slice(0, 8);
  wrap.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Recent order numbers')),
    h('div', { class: 'row' }, recent.map((o) => h('button', {
      class: 'chip', type: 'button',
      onclick: () => { input.value = o.no; look(); },
    }, `${o.no} · ${STEP_LABEL[o.status] || o.status}`)))));

  look();
  return wrap;
}

function detail(ctx, o) {
  const idx = STATUSES.indexOf(o.status);
  const closed = idx < 0;
  const track = h('div', { class: 'track' });
  STATUSES.forEach((s, i) => {
    const done = !closed && i <= idx;
    const hit = o.timeline.find((t) => t.label.toLowerCase().includes(s === 'new' ? 'placed' : s === 'preparing' ? 'preparing' : s === 'ready' ? 'ready' : 'handed'));
    track.appendChild(h('div', { class: `track__s${done ? ' is-done' : ''}` },
      STEP_LABEL[s],
      h('span', { class: 'track__t' }, done && hit ? fmtTime(hit.at) : '—')));
  });
  if (closed) {
    track.appendChild(h('div', { class: 'track__s is-off' },
      o.status === 'refunded' ? 'Refunded' : 'Cancelled',
      h('span', { class: 'track__t' }, fmtTime(o.updatedAt))));
  }

  return h('div', { class: 'grid g-side' },
    h('div', { class: 'card' },
      h('div', { class: 'between', style: 'align-items:flex-start;margin-bottom:14px' },
        h('div', {}, h('h2', { class: 'mono' }, o.no),
          h('p', { class: 'small muted' }, `Placed ${fmtDate(o.placedAt)} at ${fmtTime(o.placedAt)} · ${ago(o.placedAt)}`)),
        h('span', { class: `pill ${pillClass(o.status)}` }, STEP_LABEL[o.status] || o.status)),
      track,
      o.refund ? h('div', { class: 'banner', style: 'margin-top:14px' },
        h('span', { html: icon('alert') }),
        h('div', {}, h('strong', {}, `Refunded ${money(o.refund.amount, ctx.currency())}. `), o.refund.reason,
          o.refund.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, o.refund.note) : null)) : null,
      h('hr', { class: 'hr' }),
      h('h3', { style: 'margin-bottom:10px' }, 'Items'),
      o.items.map((it) => h('div', { class: 'cartline' },
        tile({ productId: it.productId, name: it.name, tone: toneOf(ctx, it) }, 'tile--sm'),
        h('div', { class: 'cartline__main' },
          h('div', { class: 'cartline__name' }, it.name),
          h('div', { class: 'small muted mono' }, `${it.qty} × ${money(it.price, ctx.currency())}`)),
        h('div', { class: 'mono', style: 'font-weight:600' }, money(it.price * it.qty, ctx.currency())))),
      h('div', { class: 'totals' },
        row('Subtotal', money(o.subtotal, ctx.currency())),
        o.discountAmt ? row(`Discount ${o.discountCode}`, `− ${money(o.discountAmt, ctx.currency())}`) : null,
        row('Tax', money(o.tax, ctx.currency())),
        h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, 'Total'), h('strong', {}, money(o.total, ctx.currency()))))),
    h('aside', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Order timeline')),
      h('div', { class: 'timeline' }, o.timeline.map((t) => h('div', { class: 'timeline__item' },
        h('div', { style: 'font-weight:600;font-size:13.5px' }, t.label),
        h('div', { class: 'small faint mono' }, `${fmtTime(t.at)} · ${t.by}`)))),
      h('hr', { class: 'hr' }),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Customer'), h('dd', {}, o.customer),
        h('dt', {}, 'Collection'), h('dd', {}, o.channel + (o.area ? ` · ${o.area}` : '')),
        h('dt', {}, 'Payment'), h('dd', {}, o.payment),
        h('dt', {}, 'Day'), h('dd', { class: 'mono' }, dayKey(o.placedAt)),
        o.note ? h('dt', {}, 'Note') : null, o.note ? h('dd', {}, o.note) : null)));
}

function row(label, value) {
  return h('div', { class: 'totals__row' }, h('span', {}, label), h('strong', {}, value));
}

function toneOf(ctx, it) {
  const p = ctx.state.products.find((x) => x.id === it.productId);
  return p ? p.tone : 6;
}

export function pillClass(status) {
  return status === 'completed' ? 'pill--ok'
    : status === 'ready' ? 'pill--info'
      : status === 'preparing' ? 'pill--warn'
        : status === 'new' ? 'pill--amber'
          : 'pill--bad';
}

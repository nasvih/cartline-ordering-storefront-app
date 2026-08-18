/* Storefront — look up an order by its number and watch its status. */

import { h, icon, money, fmtTime, fmtDate, ago } from '../../lib/ui.js';
import { STATUSES, orderByNo, dayKey } from '../data.js';
import { tile } from '../cart.js';
import { t } from '../main.js';
import { tr, trTimeline, L } from '../strings.js';

export default function renderTrack(ctx, params, query) {
  const wrap = h('div', {});
  const startNo = (query && query.get('no')) || ctx.state.lastOrderNo || '';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.track.title')),
      h('p', {}, t('track.sub')))));

  const input = h('input', {
    class: 'input', placeholder: t('track.field'), 'aria-label': t('track.field'), value: startNo,
  });
  const out = h('div', { style: 'margin-top:18px' });

  const look = () => {
    const raw = input.value.trim();
    out.innerHTML = '';
    if (!raw) {
      out.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('track.emptyH')),
        h('p', {}, t('track.emptyP'))));
      return;
    }
    const o = orderByNo(ctx.state, raw);
    if (!o) {
      out.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('track.notFoundH', { raw })),
        h('p', {}, t('track.notFoundP'))));
      return;
    }
    out.appendChild(detail(ctx, o));
  };

  wrap.appendChild(h('div', { class: 'card' },
    h('div', { class: 'row' },
      h('div', { class: 'search', style: 'max-width:280px' }, h('span', { html: icon('search') }), input),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: look }, t('track.find')))));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') look(); });

  wrap.appendChild(out);

  const recent = ctx.state.orders.slice(0, 8);
  wrap.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, t('track.recent'))),
    h('div', { class: 'row' }, recent.map((o) => h('button', {
      class: 'chip', type: 'button',
      onclick: () => { input.value = o.no; look(); },
    }, `${L(o.no)} · ${t(`data.trackStatus.${o.status}`)}`)))));

  look();
  return wrap;
}

function detail(ctx, o) {
  const idx = STATUSES.indexOf(o.status);
  const closed = idx < 0;
  const track = h('div', { class: 'track' });
  STATUSES.forEach((s, i) => {
    const done = !closed && i <= idx;
    const hit = o.timeline.find((e) => e.label.toLowerCase().includes(s === 'new' ? 'placed' : s === 'preparing' ? 'preparing' : s === 'ready' ? 'ready' : 'handed'));
    track.appendChild(h('div', { class: `track__s${done ? ' is-done' : ''}` },
      t(`data.trackStatus.${s}`),
      h('span', { class: 'track__t' }, done && hit ? fmtTime(hit.at) : '—')));
  });
  if (closed) {
    track.appendChild(h('div', { class: 'track__s is-off' },
      t(`data.trackStatus.${o.status}`),
      h('span', { class: 'track__t' }, fmtTime(o.updatedAt))));
  }

  return h('div', { class: 'grid g-side' },
    h('div', { class: 'card' },
      h('div', { class: 'between', style: 'align-items:flex-start;margin-bottom:14px' },
        h('div', {}, h('h2', { class: 'mono', dir: 'ltr' }, o.no),
          h('p', { class: 'small muted' }, t('track.placedAt', { date: fmtDate(o.placedAt), time: fmtTime(o.placedAt), ago: ago(o.placedAt) }))),
        h('span', { class: `pill ${pillClass(o.status)}` }, t(`data.trackStatus.${o.status}`))),
      track,
      o.refund ? h('div', { class: 'banner', style: 'margin-top:14px' },
        h('span', { html: icon('alert') }),
        h('div', {}, h('strong', {}, t('track.refunded', { money: money(o.refund.amount, ctx.currency()) })), tr('refundReason', o.refund.reason),
          o.refund.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, o.refund.note) : null)) : null,
      h('hr', { class: 'hr' }),
      h('h3', { style: 'margin-bottom:10px' }, t('track.items')),
      o.items.map((it) => h('div', { class: 'cartline' },
        tile({ productId: it.productId, name: it.name, tone: toneOf(ctx, it) }, 'tile--sm'),
        h('div', { class: 'cartline__main' },
          h('div', { class: 'cartline__name' }, it.name),
          h('div', { class: 'small muted mono' }, `${it.qty} × ${money(it.price, ctx.currency())}`)),
        h('div', { class: 'mono', style: 'font-weight:600' }, money(it.price * it.qty, ctx.currency())))),
      h('div', { class: 'totals' },
        row(t('common.subtotal'), money(o.subtotal, ctx.currency())),
        o.discountAmt ? row(t('cart.discountRow', { code: o.discountCode }), `− ${money(o.discountAmt, ctx.currency())}`) : null,
        row(t('common.tax'), money(o.tax, ctx.currency())),
        h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, t('common.total')), h('strong', {}, money(o.total, ctx.currency()))))),
    h('aside', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('track.timeline'))),
      h('div', { class: 'timeline' }, o.timeline.map((e) => h('div', { class: 'timeline__item' },
        h('div', { style: 'font-weight:600;font-size:13.5px' }, trTimeline(e.label)),
        h('div', { class: 'small faint mono' }, `${fmtTime(e.at)} · ${tr('by', e.by)}`)))),
      h('hr', { class: 'hr' }),
      h('dl', { class: 'kv' },
        h('dt', {}, t('common.customer')), h('dd', {}, o.customer),
        h('dt', {}, t('common.collection')), h('dd', {}, t(`data.channel.${o.channel}`) + (o.area ? ` · ${tr('area', o.area)}` : '')),
        h('dt', {}, t('common.payment')), h('dd', {}, t(`data.payment.${o.payment}`)),
        h('dt', {}, t('track.dayLabel')), h('dd', { class: 'mono', dir: 'ltr' }, dayKey(o.placedAt)),
        o.note ? h('dt', {}, t('common.note')) : null, o.note ? h('dd', {}, tr('orderNote', o.note)) : null)));
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

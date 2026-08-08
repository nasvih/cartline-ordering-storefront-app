/* Operations — the live order board: new → preparing → ready → completed. */

import { h, money, num, ago, toast } from '../../lib/ui.js';
import { STATUSES, dayKey, daySummary } from '../data.js';
import { advance, openOrder, STEP_LABEL, nextStatus, refundOrder } from '../orderops.js';

export default function renderBoard(ctx) {
  const wrap = h('div', {});
  let scope = 'today';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Order board'),
      h('p', {}, 'Every order the counter is working on. Move a card along as the kitchen finishes it — the customer sees the same status on the tracking screen.')),
    h('div', { class: 'btnrow' },
      h('button', { class: 'chip is-on', type: 'button', dataset: { scope: 'today' } }, 'Today'),
      h('button', { class: 'chip', type: 'button', dataset: { scope: 'all' } }, 'All open'))));

  wrap.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    wrap.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('is-on', x.dataset.scope === scope));
    paint();
  }));

  const stats = h('div', { class: 'grid g4', style: 'margin-bottom:20px' });
  const board = h('div', { class: 'board' });
  wrap.appendChild(stats);
  wrap.appendChild(board);

  function orders() {
    const today = dayKey(new Date());
    return ctx.state.orders.filter((o) => {
      if (!STATUSES.includes(o.status)) return false;
      if (scope === 'all') return o.status !== 'completed' || dayKey(o.placedAt) === today;
      return dayKey(o.placedAt) === today;
    });
  }

  function paint() {
    const list = orders();
    const sum = daySummary(ctx.state, dayKey(new Date()));
    const open = list.filter((o) => o.status !== 'completed');
    const oldest = open.slice().sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt))[0];

    stats.innerHTML = '';
    [
      ['Open orders', num(open.length), open.length ? `${open.filter((o) => o.status === 'new').length} still untouched` : 'Board is clear'],
      ['Value in the queue', money(open.reduce((s, o) => s + o.total, 0), ctx.currency()), 'Not yet handed over'],
      ['Completed today', num(sum.list.filter((o) => o.status === 'completed').length), `${num(sum.orders)} orders taken today`],
      ['Oldest waiting', oldest ? ago(oldest.placedAt) : '—', oldest ? `${oldest.no} · ${oldest.customer}` : 'Nothing waiting'],
    ].forEach(([label, value, delta], i) => {
      stats.appendChild(h('div', { class: `stat${i === 0 ? ' stat--accent' : ''}` },
        h('div', { class: 'stat__label' }, label),
        h('div', { class: 'stat__value' }, value),
        h('div', { class: 'stat__delta' }, delta)));
    });

    board.innerHTML = '';
    STATUSES.forEach((status) => {
      const cards = list.filter((o) => o.status === status)
        .sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt));
      const col = h('section', { class: 'col', 'aria-label': `${STEP_LABEL[status]} column` },
        h('div', { class: 'col__head' },
          h('h3', {}, STEP_LABEL[status]),
          h('span', { class: 'pill mono' }, String(cards.length)),
          h('span', { class: 'label' }, money(cards.reduce((s, o) => s + o.total, 0), ctx.currency()))));
      const bodyEl = h('div', { class: 'col__body' });
      if (!cards.length) {
        bodyEl.appendChild(h('div', { class: 'colempty' }, status === 'completed' ? 'Nothing handed over yet' : 'Empty'));
      }
      cards.forEach((o) => bodyEl.appendChild(card(o)));
      col.appendChild(bodyEl);
      board.appendChild(col);
    });
  }

  function card(o) {
    const mins = (Date.now() - new Date(o.placedAt).getTime()) / 60000;
    const stale = o.status !== 'completed' && mins > ctx.state.settings.prepMinutes;
    const next = nextStatus(o.status);
    const el = h('article', { class: `ocard${stale ? ' ocard--stale' : ''}` },
      h('div', { class: 'ocard__top' },
        h('span', { class: 'ocard__no' }, o.no),
        h('span', { class: 'pill' }, o.channel),
        h('span', { class: 'label', style: 'margin-left:auto' }, ago(o.placedAt))),
      h('div', { style: 'font-weight:600;font-size:13.5px' }, o.customer),
      h('div', { class: 'ocard__items' }, o.items.map((it) => `${it.qty} × ${it.name}`).join(', ')),
      o.note ? h('div', { class: 'small', style: 'color:var(--amber-deep)' }, `Note: ${o.note}`) : null,
      stale ? h('span', { class: 'pill pill--warn' }, `Over ${ctx.state.settings.prepMinutes} min`) : null,
      h('div', { class: 'ocard__foot' },
        h('span', { class: 'mono', style: 'font-weight:600' }, money(o.total, ctx.currency())),
        h('div', { class: 'btnrow' },
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => openOrder(ctx, o.id, paint),
          }, 'Detail'),
          next ? h('button', {
            class: 'btn btn--sm btn--primary', type: 'button',
            onclick: () => { advance(ctx, o); paint(); },
          }, STEP_LABEL[next]) : h('button', {
            class: 'btn btn--sm btn--danger', type: 'button',
            onclick: () => refundOrder(ctx, o, paint),
          }, 'Refund'))));
    return el;
  }

  if (!ctx.state.orders.length) toast('No orders in the demo data', '');
  paint();
  return wrap;
}

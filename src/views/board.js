/* Operations — the live order board: new → preparing → ready → completed. */

import { h, money, num, ago, toast } from '../../lib/ui.js';
import { STATUSES, dayKey, daySummary } from '../data.js';
import { advance, openOrder, STEP_LABEL, nextStatus, refundOrder } from '../orderops.js';
import { t } from '../main.js';
import { tr } from '../strings.js';

export default function renderBoard(ctx) {
  const wrap = h('div', {});
  let scope = 'today';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.board.title')),
      h('p', {}, t('board.sub'))),
    h('div', { class: 'btnrow' },
      h('button', { class: 'chip is-on', type: 'button', dataset: { scope: 'today' } }, t('board.today')),
      h('button', { class: 'chip', type: 'button', dataset: { scope: 'all' } }, t('board.allOpen')))));

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
      [t('board.openOrders'), num(open.length), open.length ? t('board.untouched', { n: open.filter((o) => o.status === 'new').length }) : t('board.boardClear')],
      [t('board.queueValue'), money(open.reduce((s, o) => s + o.total, 0), ctx.currency()), t('board.notHanded')],
      [t('board.doneToday'), num(sum.list.filter((o) => o.status === 'completed').length), t('board.takenToday', { n: num(sum.orders) })],
      [t('board.oldest'), oldest ? ago(oldest.placedAt) : '—', oldest ? `${oldest.no} · ${oldest.customer}` : t('board.nothingWaiting')],
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
      const col = h('section', { class: 'col', 'aria-label': t('board.colAria', { label: STEP_LABEL(status) }) },
        h('div', { class: 'col__head' },
          h('h3', {}, STEP_LABEL(status)),
          h('span', { class: 'pill mono' }, String(cards.length)),
          h('span', { class: 'label' }, money(cards.reduce((s, o) => s + o.total, 0), ctx.currency()))));
      const bodyEl = h('div', { class: 'col__body' });
      if (!cards.length) {
        bodyEl.appendChild(h('div', { class: 'colempty' }, status === 'completed' ? t('board.nothingHanded') : t('board.empty')));
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
        h('span', { class: 'ocard__no', dir: 'ltr' }, o.no),
        h('span', { class: 'pill' }, t(`data.channel.${o.channel}`)),
        h('span', { class: 'label', style: 'margin-left:auto' }, ago(o.placedAt))),
      h('div', { style: 'font-weight:600;font-size:13.5px' }, o.customer),
      h('div', { class: 'ocard__items' }, o.items.map((it) => `${it.qty} × ${it.name}`).join(', ')),
      o.note ? h('div', { class: 'small', style: 'color:var(--amber-deep)' }, t('board.noteLine', { note: tr('orderNote', o.note) })) : null,
      stale ? h('span', { class: 'pill pill--warn' }, t('board.over', { n: ctx.state.settings.prepMinutes })) : null,
      h('div', { class: 'ocard__foot' },
        h('span', { class: 'mono', style: 'font-weight:600' }, money(o.total, ctx.currency())),
        h('div', { class: 'btnrow' },
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => openOrder(ctx, o.id, paint),
          }, t('board.detail')),
          next ? h('button', {
            class: 'btn btn--sm btn--primary', type: 'button',
            onclick: () => { advance(ctx, o); paint(); },
          }, STEP_LABEL(next)) : h('button', {
            class: 'btn btn--sm btn--danger', type: 'button',
            onclick: () => refundOrder(ctx, o, paint),
          }, t('board.refund')))));
    return el;
  }

  if (!ctx.state.orders.length) toast(t('board.noOrders'), '');
  paint();
  return wrap;
}

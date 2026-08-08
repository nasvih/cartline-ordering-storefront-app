/* Operations — the day summary: orders, revenue, average order value, top items. */

import { h, icon, money, num, pct, barChart, downloadCSV, toast, fmtTime } from '../../lib/ui.js';
import {
  dayKey, dayLabel, lastDays, daySummary, topItems, revenueByHour, revenueByCategory, ordersOn,
} from '../data.js';
import { openOrder } from '../orderops.js';

const CHANNEL_TONE = { Counter: 'var(--amber-fill)', Pickup: 'var(--ok)', Delivery: 'var(--info)' };

export default function renderSummary(ctx) {
  const wrap = h('div', {});
  let day = dayKey(new Date());

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Day summary'),
      h('p', {}, 'One day at a time. Place an order on the storefront and these numbers move immediately — nothing here is precomputed.')),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', html: `${icon('download')}<span>Export day</span>`, onclick: () => exportDay(ctx, day) }))));

  const picker = h('div', { class: 'daypick' });
  lastDays(7).forEach((k) => {
    picker.appendChild(h('button', {
      class: `chip${k === day ? ' is-on' : ''}`, type: 'button', dataset: { day: k }, 'aria-pressed': String(k === day),
      onclick: () => {
        day = k;
        [...picker.children].forEach((b) => {
          const on = b.dataset.day === day;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        paint();
      },
    }, dayLabel(k)));
  });
  wrap.appendChild(picker);

  const host = h('div', {});
  wrap.appendChild(host);

  function paint() {
    const s = daySummary(ctx.state, day);
    const cur = ctx.currency();
    const prevKey = lastDays(8)[lastDays(8).indexOf(day) + 1];
    const prev = prevKey ? daySummary(ctx.state, prevKey) : null;
    const delta = (now, before) => {
      if (!before) return 'No day before it in the sample';
      if (!before && !now) return 'flat';
      const d = now - before;
      const sign = d > 0 ? '+' : '';
      return `${sign}${Math.round(before ? (d / before) * 100 : 100)}% against ${dayLabel(prevKey).toLowerCase()}`;
    };

    host.innerHTML = '';
    host.appendChild(h('div', { class: 'grid g4', style: 'margin-bottom:20px' },
      stat('Orders', num(s.orders), `${num(s.billable)} billable · ${num(s.cancelled)} cancelled`, true),
      stat('Gross revenue', money(s.gross, cur), prev ? delta(s.gross, prev.gross) : ''),
      stat('Average order value', money(s.aov, cur), `${num(s.items)} items sold`),
      stat('Refunds', money(s.refunds, cur), `${num(s.refundCount)} orders refunded`)));

    const hours = revenueByHour(ctx.state, day);
    const busiest = hours.slice().sort((a, b) => b.value - a.value)[0];
    host.appendChild(h('div', { class: 'grid g-side', style: 'margin-bottom:20px;align-items:start' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' },
          h('h3', {}, 'Revenue by hour'),
          h('span', { class: 'label' }, busiest && busiest.value ? `Busiest ${busiest.label}:00` : 'Quiet day')),
        barChart(hours, { format: (v) => money(v, cur) }),
        h('p', { class: 'hint' }, `Each column is one trading hour, ${hours[0].label}:00 to ${hours[hours.length - 1].label}:00.`)),
      h('aside', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Net after refunds')),
        h('p', { class: 'stat__value' }, money(s.net, cur)),
        h('p', { class: 'small muted' }, `Gross ${money(s.gross, cur)} less ${money(s.refunds, cur)} refunded.`),
        h('hr', { class: 'hr' }),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Discounts'), h('dd', { class: 'mono' }, money(s.discount, cur)),
          h('dt', {}, 'Items'), h('dd', { class: 'mono' }, num(s.items)),
          h('dt', {}, 'Basket'), h('dd', { class: 'mono' }, money(s.aov, cur)),
          h('dt', {}, 'Refund rate'), h('dd', { class: 'mono' }, pct(s.billable ? (s.refundCount / s.billable) * 100 : 0, 1))),
        channelSplit(ctx, day))));

    const items = topItems(ctx.state, day, 8);
    const cats = revenueByCategory(ctx.state, day).sort((a, b) => b.value - a.value);
    host.appendChild(h('div', { class: 'grid g2', style: 'margin-bottom:20px' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Top items')),
        items.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'right' }, 'Sold'), h('th', { class: 'right' }, 'Revenue'))),
          h('tbody', {}, items.map((it) => h('tr', {},
            h('td', {}, it.name),
            h('td', { class: 'right mono' }, num(it.qty)),
            h('td', { class: 'right mono' }, money(it.revenue, cur)))))))
          : h('div', { class: 'empty' }, h('h3', {}, 'Nothing sold on this day'))),
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Revenue by category')),
        barChart(cats, { format: (v) => money(v, cur), muted: (x) => x.value === 0 }))));

    const list = ordersOn(ctx.state, day).slice().sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
    host.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, `Orders on ${dayLabel(day).toLowerCase()}`), h('span', { class: 'label' }, `${num(list.length)} records`)),
      list.length ? h('div', { class: 'tablewrap tablewrap--scroll' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Order'), h('th', {}, 'Time'), h('th', {}, 'Customer'), h('th', {}, 'Channel'), h('th', { class: 'right' }, 'Total'), h('th', {}, 'Status'))),
        h('tbody', {}, list.map((o) => h('tr', {},
          h('td', {}, h('span', { class: 'linkish mono', role: 'button', tabindex: '0', onclick: () => openOrder(ctx, o.id, paint), onkeydown: (e) => { if (e.key === 'Enter') openOrder(ctx, o.id, paint); } }, o.no)),
          h('td', { class: 'mono small' }, fmtTime(o.placedAt)),
          h('td', {}, o.customer),
          h('td', { class: 'small muted' }, o.channel),
          h('td', { class: 'right mono' }, money(o.total, cur)),
          h('td', { class: 'small' }, o.status === 'refunded' && o.refund ? `Refunded — ${o.refund.reason}` : o.status))))))
        : h('div', { class: 'empty' }, h('h3', {}, 'No orders on this day'))));
  }

  paint();
  return wrap;
}

function stat(label, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: 'stat__value' }, value),
    h('div', { class: 'stat__delta' }, delta || ''));
}

function channelSplit(ctx, day) {
  const list = ordersOn(ctx.state, day).filter((o) => o.status !== 'cancelled');
  const total = list.reduce((s, o) => s + o.total, 0) || 1;
  const rows = Object.keys(CHANNEL_TONE).map((c) => ({
    channel: c,
    value: list.filter((o) => o.channel === c).reduce((s, o) => s + o.total, 0),
  }));
  const bar = h('div', { class: 'split', role: 'img', 'aria-label': rows.map((r) => `${r.channel} ${Math.round((r.value / total) * 100)}%`).join(', ') },
    rows.map((r) => h('i', { style: `width:${(r.value / total) * 100}%;background:${CHANNEL_TONE[r.channel]}` })));
  return h('div', { style: 'margin-top:16px' },
    h('p', { class: 'label', style: 'margin-bottom:8px' }, 'Revenue by channel'),
    bar,
    h('div', { class: 'legend' }, rows.map((r) => h('span', {},
      h('i', { class: 'swatch', style: `background:${CHANNEL_TONE[r.channel]}` }),
      `${r.channel} ${Math.round((r.value / total) * 100)}%`))));
}

function exportDay(ctx, day) {
  const s = daySummary(ctx.state, day);
  const rows = [
    ['Cartline day summary', day],
    [],
    ['Orders', s.orders], ['Billable', s.billable], ['Cancelled', s.cancelled],
    ['Gross revenue', s.gross], ['Refunds', s.refunds], ['Net revenue', s.net],
    ['Average order value', s.aov], ['Items sold', s.items], ['Discount given', s.discount],
    [],
    ['Top items', 'Sold', 'Revenue'],
    ...topItems(ctx.state, day, 10).map((it) => [it.name, it.qty, it.revenue]),
  ];
  downloadCSV(`cartline-summary-${day}.csv`, rows);
  toast(`Summary for ${dayLabel(day).toLowerCase()} exported`, 'ok');
}

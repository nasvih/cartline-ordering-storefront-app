/* Operations — the day summary: orders, revenue, average order value, top items. */

import { h, icon, money, num, pct, barChart, downloadCSV, toast, fmtTime } from '../../lib/ui.js';
import {
  dayKey, dayLabel, lastDays, daySummary, topItems, revenueByHour, revenueByCategory, ordersOn,
} from '../data.js';
import { openOrder } from '../orderops.js';
import { t } from '../main.js';
import { tr, L } from '../strings.js';

const CHANNEL_TONE = { Counter: 'var(--amber-fill)', Pickup: 'var(--ok)', Delivery: 'var(--info)' };

export default function renderSummary(ctx) {
  const wrap = h('div', {});
  let day = dayKey(new Date());

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.summary.title')),
      h('p', {}, t('summary.sub'))),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', html: `${icon('download')}<span>${t('summary.exportDay')}</span>`, onclick: () => exportDay(ctx, day) }))));

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
      if (!before) return t('summary.noDayBefore');
      if (!before && !now) return t('summary.flat');
      const d = now - before;
      const sign = d > 0 ? '+' : '';
      return t('summary.delta', {
        sign,
        pct: Math.round(before ? (d / before) * 100 : 100),
        day: dayLabel(prevKey).toLowerCase(),
      });
    };

    host.innerHTML = '';
    host.appendChild(h('div', { class: 'grid g4', style: 'margin-bottom:20px' },
      stat(t('summary.orders'), num(s.orders), t('summary.billableLine', { billable: num(s.billable), cancelled: num(s.cancelled) }), true),
      stat(t('summary.gross'), money(s.gross, cur), prev ? delta(s.gross, prev.gross) : ''),
      stat(t('summary.aov'), money(s.aov, cur), t('summary.itemsSold', { n: num(s.items) })),
      stat(t('summary.refunds'), money(s.refunds, cur), t('summary.refundedOrders', { n: num(s.refundCount) }))));

    const hours = revenueByHour(ctx.state, day);
    const busiest = hours.slice().sort((a, b) => b.value - a.value)[0];
    host.appendChild(h('div', { class: 'grid g-side', style: 'margin-bottom:20px;align-items:start' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' },
          h('h3', {}, t('summary.byHour')),
          h('span', { class: 'label' }, busiest && busiest.value ? t('summary.busiest', { hour: busiest.label }) : t('summary.quietDay'))),
        barChart(hours, { format: (v) => money(v, cur) }),
        h('p', { class: 'hint' }, t('summary.hourHint', { from: hours[0].label, to: hours[hours.length - 1].label }))),
      h('aside', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('summary.net'))),
        h('p', { class: 'stat__value' }, money(s.net, cur)),
        h('p', { class: 'small muted' }, t('summary.netLine', { gross: money(s.gross, cur), refunds: money(s.refunds, cur) })),
        h('hr', { class: 'hr' }),
        h('dl', { class: 'kv' },
          h('dt', {}, t('summary.discounts')), h('dd', { class: 'mono' }, money(s.discount, cur)),
          h('dt', {}, t('common.items')), h('dd', { class: 'mono' }, num(s.items)),
          h('dt', {}, t('summary.basket')), h('dd', { class: 'mono' }, money(s.aov, cur)),
          h('dt', {}, t('summary.refundRate')), h('dd', { class: 'mono' }, pct(s.billable ? (s.refundCount / s.billable) * 100 : 0, 1))),
        channelSplit(ctx, day))));

    const items = topItems(ctx.state, day, 8);
    const cats = revenueByCategory(ctx.state, day).sort((a, b) => b.value - a.value);
    host.appendChild(h('div', { class: 'grid g2', style: 'margin-bottom:20px' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('summary.topItems'))),
        items.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, t('common.item')), h('th', { class: 'right' }, t('common.sold')), h('th', { class: 'right' }, t('common.revenue')))),
          h('tbody', {}, items.map((it) => h('tr', {},
            h('td', {}, it.name),
            h('td', { class: 'right mono' }, num(it.qty)),
            h('td', { class: 'right mono' }, money(it.revenue, cur)))))))
          : h('div', { class: 'empty' }, h('h3', {}, t('summary.nothingSold')))),
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('summary.byCategory'))),
        barChart(cats, { format: (v) => money(v, cur), muted: (x) => x.value === 0 }))));

    const list = ordersOn(ctx.state, day).slice().sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
    host.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('summary.ordersOn', { day: dayLabel(day).toLowerCase() })), h('span', { class: 'label' }, t('summary.records', { n: num(list.length) }))),
      list.length ? h('div', { class: 'tablewrap tablewrap--scroll' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, t('common.order')), h('th', {}, t('common.time')), h('th', {}, t('common.customer')), h('th', {}, t('common.channel')), h('th', { class: 'right' }, t('common.total')), h('th', {}, t('common.status')))),
        h('tbody', {}, list.map((o) => h('tr', {},
          h('td', {}, h('span', { class: 'linkish mono', role: 'button', tabindex: '0', onclick: () => openOrder(ctx, o.id, paint), onkeydown: (e) => { if (e.key === 'Enter') openOrder(ctx, o.id, paint); } }, o.no)),
          h('td', { class: 'mono small' }, fmtTime(o.placedAt)),
          h('td', {}, o.customer),
          h('td', { class: 'small muted' }, t(`data.channel.${o.channel}`)),
          h('td', { class: 'right mono' }, money(o.total, cur)),
          h('td', { class: 'small' }, o.status === 'refunded' && o.refund
            ? t('summary.refundedCell', { reason: tr('refundReason', o.refund.reason) })
            : t(`data.statusRaw.${o.status}`)))))))
        : h('div', { class: 'empty' }, h('h3', {}, t('summary.noOrders')))));
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
  const bar = h('div', { class: 'split', role: 'img', 'aria-label': rows.map((r) => `${t(`data.channel.${r.channel}`)} ${Math.round((r.value / total) * 100)}%`).join(', ') },
    rows.map((r) => h('i', { style: `width:${(r.value / total) * 100}%;background:${CHANNEL_TONE[r.channel]}` })));
  return h('div', { style: 'margin-top:16px' },
    h('p', { class: 'label', style: 'margin-bottom:8px' }, t('summary.byChannel')),
    bar,
    h('div', { class: 'legend' }, rows.map((r) => h('span', {},
      h('i', { class: 'swatch', style: `background:${CHANNEL_TONE[r.channel]}` }),
      /* The share is a Latin run — isolate it so it does not slide into the
         Arabic label beside it. `L` is a no-op in English. */
      `${t(`data.channel.${r.channel}`)} ${L(`${Math.round((r.value / total) * 100)}%`)}`))));
}

function exportDay(ctx, day) {
  const s = daySummary(ctx.state, day);
  const rows = [
    [t('summary.csvTitle'), day],
    [],
    [t('summary.csvOrders'), s.orders], [t('summary.csvBillable'), s.billable], [t('summary.csvCancelled'), s.cancelled],
    [t('summary.csvGross'), s.gross], [t('summary.csvRefunds'), s.refunds], [t('summary.csvNet'), s.net],
    [t('summary.csvAov'), s.aov], [t('summary.csvItems'), s.items], [t('summary.csvDiscount'), s.discount],
    [],
    [t('summary.csvTop'), t('common.sold'), t('common.revenue')],
    ...topItems(ctx.state, day, 10).map((it) => [it.name, it.qty, it.revenue]),
  ];
  downloadCSV(`cartline-summary-${day}.csv`, rows);
  toast(t('summary.exported', { day: dayLabel(day).toLowerCase() }), 'ok');
}

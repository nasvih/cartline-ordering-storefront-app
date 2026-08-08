/* Operations — every order in one table, with detail, refund and export. */

import { h, icon, money, num, fmtDate, fmtTime, downloadCSV, toast } from '../../lib/ui.js';
import { STATUSES, CHANNELS, dayKey, lastDays } from '../data.js';
import { openOrder, advance, refundOrder, STEP_LABEL, nextStatus } from '../orderops.js';
import { pillClass } from './track.js';

const ALL_STATUS = [...STATUSES, 'refunded', 'cancelled'];

export default function renderOrders(ctx) {
  const wrap = h('div', {});
  const f = { term: '', status: 'all', channel: 'all', day: 'all' };

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Orders'),
      h('p', {}, 'The full ledger, including refunds and cancellations. Click a row for the detail drawer, the timeline and the refund action.')),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>Export CSV</span>`,
        onclick: () => exportRows(ctx, filtered()),
      }))));

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Order number, customer or item', 'aria-label': 'Search orders' });
  search.addEventListener('input', () => { f.term = search.value.trim().toLowerCase(); paint(); });

  const statusSel = sel('Status', ['all', ...ALL_STATUS], (v) => { f.status = v; paint(); }, (v) => (v === 'all' ? 'All statuses' : STEP_LABEL[v]));
  const channelSel = sel('Channel', ['all', ...CHANNELS], (v) => { f.channel = v; paint(); }, (v) => (v === 'all' ? 'All channels' : v));
  const daySel = sel('Day', ['all', ...lastDays(7)], (v) => { f.day = v; paint(); }, (v) => (v === 'all' ? 'Last 7 days' : v));

  wrap.appendChild(h('div', { class: 'filters' },
    h('div', { class: 'search' }, h('span', { html: icon('search') }), search),
    statusSel, channelSel, daySel));

  const count = h('p', { class: 'label', style: 'margin-bottom:10px' }, '');
  const host = h('div', {});
  wrap.appendChild(count);
  wrap.appendChild(host);

  function filtered() {
    const days = lastDays(7);
    return ctx.state.orders.filter((o) => {
      const day = dayKey(o.placedAt);
      if (f.day === 'all' ? !days.includes(day) : day !== f.day) return false;
      if (f.status !== 'all' && o.status !== f.status) return false;
      if (f.channel !== 'all' && o.channel !== f.channel) return false;
      if (f.term) {
        const hay = `${o.no} ${o.customer} ${o.items.map((i) => i.name).join(' ')} ${o.discountCode}`.toLowerCase();
        if (!hay.includes(f.term)) return false;
      }
      return true;
    });
  }

  function paint() {
    const rows = filtered();
    count.textContent = `${num(rows.length)} orders · ${money(rows.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0), ctx.currency())} billed`;
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'No orders match those filters'),
        h('p', {}, 'Widen the day range or clear the search.')));
      return;
    }
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Order'), h('th', {}, 'Placed'), h('th', {}, 'Customer'),
        h('th', {}, 'Channel'), h('th', {}, 'Items'), h('th', { class: 'right' }, 'Total'),
        h('th', {}, 'Status'), h('th', { class: 'right' }, 'Action'))),
      h('tbody', {}, rows.map((o) => {
        const next = nextStatus(o.status);
        return h('tr', {},
          h('td', {}, h('span', { class: 'linkish mono', role: 'button', tabindex: '0', onclick: () => openOrder(ctx, o.id, paint), onkeydown: (e) => { if (e.key === 'Enter') openOrder(ctx, o.id, paint); } }, o.no)),
          h('td', { class: 'mono small nowrap' }, `${fmtDate(o.placedAt, { day: '2-digit', month: 'short' })} ${fmtTime(o.placedAt)}`),
          h('td', {}, o.customer),
          h('td', { class: 'small muted' }, o.channel + (o.area ? ` · ${o.area}` : '')),
          h('td', { class: 'small muted' }, `${o.items.reduce((s, i) => s + i.qty, 0)} items${o.discountCode ? ` · ${o.discountCode}` : ''}`),
          h('td', { class: 'right mono' }, money(o.total, ctx.currency())),
          h('td', {}, h('span', { class: `pill ${pillClass(o.status)}` }, STEP_LABEL[o.status])),
          h('td', { class: 'right' }, h('div', { class: 'rowbtns' },
            next ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { advance(ctx, o); paint(); } }, STEP_LABEL[next]) : null,
            o.status !== 'refunded' && o.status !== 'cancelled'
              ? h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: () => refundOrder(ctx, o, paint) }, 'Refund')
              : null)));
      })));
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, table));
  }

  paint();
  return wrap;
}

function sel(label, values, onChange, fmt) {
  const s = h('select', { class: 'select', 'aria-label': label },
    ...values.map((v) => h('option', { value: v }, fmt(v))));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function exportRows(ctx, rows) {
  const head = ['Order', 'Placed', 'Customer', 'Channel', 'Items', 'Subtotal', 'Discount', 'Code', 'Tax', 'Total', 'Status', 'Refund'];
  const body = rows.map((o) => [
    o.no, o.placedAt, o.customer, o.channel,
    o.items.map((i) => `${i.qty}x ${i.name}`).join(' | '),
    o.subtotal, o.discountAmt, o.discountCode, o.tax, o.total,
    o.status, o.refund ? o.refund.reason : '',
  ]);
  downloadCSV(`cartline-orders-${dayKey(new Date())}.csv`, [head, ...body]);
  toast(`${rows.length} orders exported`, 'ok');
}

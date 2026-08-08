/* Operations — discount codes: create, pause, edit, delete, and see what each one cost. */

import { h, icon, money, num, modal, toast, confirmDialog } from '../../lib/ui.js';
import { lastDays, dayKey } from '../data.js';

export default function renderDiscounts(ctx) {
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Discount codes'),
      h('p', {}, 'Codes the storefront accepts at checkout. Pausing one stops it working straight away — try it, then apply the code in the cart.')),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn btn--primary', type: 'button', html: `${icon('plus')}<span>New code</span>`, onclick: () => editCode(ctx, null, paint) }))));

  const stats = h('div', { class: 'grid g4', style: 'margin-bottom:20px' });
  const host = h('div', {});
  wrap.appendChild(stats);
  wrap.appendChild(host);

  function usage() {
    const days = lastDays(7);
    const map = new Map();
    ctx.state.orders.forEach((o) => {
      if (!o.discountCode || o.status === 'cancelled') return;
      if (!days.includes(dayKey(o.placedAt))) return;
      const cur = map.get(o.discountCode) || { orders: 0, given: 0, revenue: 0 };
      cur.orders += 1;
      cur.given += o.discountAmt;
      cur.revenue += o.total;
      map.set(o.discountCode, cur);
    });
    return map;
  }

  function paint() {
    const s = ctx.state;
    const use = usage();
    const given = [...use.values()].reduce((t, u) => t + u.given, 0);
    const orders = [...use.values()].reduce((t, u) => t + u.orders, 0);
    const top = [...use.entries()].sort((a, b) => b[1].given - a[1].given)[0];

    stats.innerHTML = '';
    [
      ['Active codes', num(s.discounts.filter((d) => d.active).length), `${num(s.discounts.length)} configured`],
      ['Discount given', money(given, ctx.currency()), 'Last seven days'],
      ['Orders with a code', num(orders), `${orders && s.orders.length ? Math.round((orders / s.orders.length) * 100) : 0}% of all orders`],
      ['Costliest code', top ? top[0] : '—', top ? `${money(top[1].given, ctx.currency())} given away` : 'No code used yet'],
    ].forEach(([label, value, delta]) => stats.appendChild(h('div', { class: 'stat' },
      h('div', { class: 'stat__label' }, label),
      h('div', { class: 'stat__value' }, value),
      h('div', { class: 'stat__delta' }, delta))));

    host.innerHTML = '';
    if (!s.discounts.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No codes yet'), h('p', {}, 'Add one and it becomes usable in the cart immediately.')));
      return;
    }
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Code'), h('th', {}, 'Discount'), h('th', { class: 'right' }, 'Minimum basket'),
        h('th', { class: 'right' }, 'Uses'), h('th', { class: 'right' }, 'Given (7d)'), h('th', {}, 'State'),
        h('th', {}, 'Note'), h('th', { class: 'right' }, 'Action'))),
      h('tbody', {}, s.discounts.map((d) => {
        const u = use.get(d.code) || { orders: 0, given: 0 };
        return h('tr', {},
          h('td', { class: 'codecell' }, d.code),
          h('td', {}, d.kind === 'pct' ? `${d.value}% off` : `${money(d.value, ctx.currency())} off`),
          h('td', { class: 'right mono' }, d.minOrder ? money(d.minOrder, ctx.currency()) : '—'),
          h('td', { class: 'right mono' }, d.maxUses ? `${d.uses} / ${d.maxUses}` : String(d.uses)),
          h('td', { class: 'right mono' }, u.given ? money(u.given, ctx.currency()) : '—'),
          h('td', {}, d.active ? h('span', { class: 'pill pill--ok' }, 'Active') : h('span', { class: 'pill' }, 'Paused')),
          h('td', { class: 'small muted' }, d.note),
          h('td', { class: 'right' }, h('div', { class: 'rowbtns' },
            h('button', {
              class: 'btn btn--sm', type: 'button',
              onclick: () => {
                ctx.store.update((st) => { const t = st.discounts.find((x) => x.code === d.code); if (t) t.active = !t.active; });
                toast(`${d.code} ${d.active ? 'paused' : 'active'}`, 'ok');
                paint();
              },
            }, d.active ? 'Pause' : 'Activate'),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => editCode(ctx, d, paint) }, 'Edit'))));
      })));
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, table));
  }

  paint();
  return wrap;
}

function editCode(ctx, d, done) {
  const code = h('input', { class: 'input', value: d ? d.code : '', placeholder: 'SUMMER10', 'aria-label': 'Code' });
  const kind = h('select', { class: 'select', 'aria-label': 'Discount type' },
    h('option', { value: 'pct', selected: !d || d.kind === 'pct' }, 'Percent off'),
    h('option', { value: 'flat', selected: d && d.kind === 'flat' }, 'Flat amount off'));
  const value = h('input', { class: 'input', type: 'number', min: '1', value: d ? String(d.value) : '10', 'aria-label': 'Discount value' });
  const minOrder = h('input', { class: 'input', type: 'number', min: '0', value: d ? String(d.minOrder) : '0', 'aria-label': 'Minimum basket' });
  const maxUses = h('input', { class: 'input', type: 'number', min: '0', value: d ? String(d.maxUses) : '0', 'aria-label': 'Maximum uses, zero for no limit' });
  const note = h('input', { class: 'input', value: d ? d.note : '', placeholder: 'What this code is for', 'aria-label': 'Note' });
  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const actions = [{ label: 'Close' }];
  if (d) {
    actions.push({
      label: 'Delete',
      class: 'btn--danger',
      onClick: () => {
        confirmDialog(`Delete ${d.code}? Orders that already used it keep their discount.`, { title: 'Delete code', okLabel: 'Delete', danger: true })
          .then((ok) => {
            if (!ok) return;
            ctx.store.update((s) => {
              s.discounts = s.discounts.filter((x) => x.code !== d.code);
              if (s.cart.code === d.code) s.cart.code = '';
            });
            m.close();
            toast(`${d.code} deleted`, '');
            done();
          });
        return true;
      },
    });
  }
  actions.push({
    label: d ? 'Save code' : 'Create code',
    class: 'btn--primary',
    onClick: () => {
      const c = code.value.trim().toUpperCase().replace(/\s+/g, '');
      const v = Number(value.value);
      if (!/^[A-Z0-9]{3,16}$/.test(c)) { err.textContent = 'Use 3 to 16 letters or digits, no spaces.'; err.hidden = false; return true; }
      if (!(v > 0)) { err.textContent = 'The discount has to be more than zero.'; err.hidden = false; return true; }
      if (kind.value === 'pct' && v > 60) { err.textContent = 'Keep percentage codes at 60 or below.'; err.hidden = false; return true; }
      if (!d && ctx.state.discounts.some((x) => x.code === c)) { err.textContent = 'That code already exists.'; err.hidden = false; return true; }
      ctx.store.update((s) => {
        const payload = {
          code: c, kind: kind.value, value: v,
          minOrder: Math.max(0, Number(minOrder.value) || 0),
          maxUses: Math.max(0, Number(maxUses.value) || 0),
          note: note.value.trim() || 'Added from the operations side',
        };
        if (d) {
          const t = s.discounts.find((x) => x.code === d.code);
          if (t) Object.assign(t, payload);
          if (s.cart.code === d.code) s.cart.code = payload.code;
        } else {
          s.discounts.push({ ...payload, active: true, uses: 0 });
        }
      });
      toast(d ? `${c} saved` : `${c} is live on the storefront`, 'ok');
      done();
      return false;
    },
  });

  const m = modal({
    title: d ? `Edit ${d.code}` : 'New discount code',
    body: h('div', {},
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Code'), code),
      h('div', { class: 'grid g2', style: 'margin-top:14px;gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Type'), kind),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Value'), value),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Minimum basket'), minOrder),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Maximum uses'), maxUses)),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Note'), note),
      err),
    actions,
  });
}

/* Operations — discount codes: create, pause, edit, delete, and see what each one cost. */

import { h, icon, money, num, modal, toast, confirmDialog } from '../../lib/ui.js';
import { lastDays, dayKey } from '../data.js';
import { t } from '../main.js';
import { tr } from '../strings.js';

export default function renderDiscounts(ctx) {
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.discounts.title')),
      h('p', {}, t('discounts.sub'))),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn btn--primary', type: 'button', html: `${icon('plus')}<span>${t('discounts.newCode')}</span>`, onclick: () => editCode(ctx, null, paint) }))));

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
    const given = [...use.values()].reduce((total, u) => total + u.given, 0);
    const orders = [...use.values()].reduce((total, u) => total + u.orders, 0);
    const top = [...use.entries()].sort((a, b) => b[1].given - a[1].given)[0];

    stats.innerHTML = '';
    [
      [t('discounts.activeCodes'), num(s.discounts.filter((d) => d.active).length), t('discounts.configured', { n: num(s.discounts.length) })],
      [t('discounts.given'), money(given, ctx.currency()), t('discounts.last7')],
      [t('discounts.withCode'), num(orders), t('discounts.shareOfAll', { pct: orders && s.orders.length ? Math.round((orders / s.orders.length) * 100) : 0 })],
      [t('discounts.costliest'), top ? top[0] : t('common.dash'), top ? t('discounts.givenAway', { money: money(top[1].given, ctx.currency()) }) : t('discounts.noneUsed')],
    ].forEach(([label, value, delta]) => stats.appendChild(h('div', { class: 'stat' },
      h('div', { class: 'stat__label' }, label),
      h('div', { class: 'stat__value' }, value),
      h('div', { class: 'stat__delta' }, delta))));

    host.innerHTML = '';
    if (!s.discounts.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, t('discounts.emptyH')), h('p', {}, t('discounts.emptyP'))));
      return;
    }
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, t('common.code')), h('th', {}, t('common.discount')), h('th', { class: 'right' }, t('discounts.minBasket')),
        h('th', { class: 'right' }, t('discounts.uses')), h('th', { class: 'right' }, t('discounts.given7')), h('th', {}, t('common.state')),
        h('th', {}, t('common.note')), h('th', { class: 'right' }, t('common.action')))),
      h('tbody', {}, s.discounts.map((d) => {
        const u = use.get(d.code) || { orders: 0, given: 0 };
        return h('tr', {},
          h('td', { class: 'codecell', dir: 'ltr' }, d.code),
          h('td', {}, d.kind === 'pct' ? t('discounts.pctOff', { value: d.value }) : t('discounts.flatOff', { money: money(d.value, ctx.currency()) })),
          h('td', { class: 'right mono' }, d.minOrder ? money(d.minOrder, ctx.currency()) : t('common.dash')),
          h('td', { class: 'right mono' }, d.maxUses ? `${d.uses} / ${d.maxUses}` : String(d.uses)),
          h('td', { class: 'right mono' }, u.given ? money(u.given, ctx.currency()) : t('common.dash')),
          h('td', {}, d.active ? h('span', { class: 'pill pill--ok' }, t('discounts.stateActive')) : h('span', { class: 'pill' }, t('discounts.statePaused'))),
          h('td', { class: 'small muted' }, tr('discountNote', d.note)),
          h('td', { class: 'right' }, h('div', { class: 'rowbtns' },
            h('button', {
              class: 'btn btn--sm', type: 'button',
              onclick: () => {
                ctx.store.update((st) => { const target = st.discounts.find((x) => x.code === d.code); if (target) target.active = !target.active; });
                toast(t('discounts.toggled', { code: d.code, state: d.active ? t('discounts.toggledPaused') : t('discounts.toggledActive') }), 'ok');
                paint();
              },
            }, d.active ? t('discounts.pause') : t('discounts.activate')),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => editCode(ctx, d, paint) }, t('common.edit')))));
      })));
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, table));
  }

  paint();
  return wrap;
}

function editCode(ctx, d, done) {
  const code = h('input', { class: 'input', value: d ? d.code : '', placeholder: 'SUMMER10', 'aria-label': t('discounts.codeAria'), dir: 'ltr' });
  const kind = h('select', { class: 'select', 'aria-label': t('discounts.typeAria') },
    h('option', { value: 'pct', selected: !d || d.kind === 'pct' }, t('discounts.percentOff')),
    h('option', { value: 'flat', selected: d && d.kind === 'flat' }, t('discounts.flatAmount')));
  const value = h('input', { class: 'input', type: 'number', min: '1', value: d ? String(d.value) : '10', 'aria-label': t('discounts.valueAria') });
  const minOrder = h('input', { class: 'input', type: 'number', min: '0', value: d ? String(d.minOrder) : '0', 'aria-label': t('discounts.minAria') });
  const maxUses = h('input', { class: 'input', type: 'number', min: '0', value: d ? String(d.maxUses) : '0', 'aria-label': t('discounts.maxAria') });
  const note = h('input', { class: 'input', value: d ? tr('discountNote', d.note) : '', placeholder: t('discounts.notePh'), 'aria-label': t('discounts.noteAria') });
  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const actions = [{ label: t('common.close') }];
  if (d) {
    actions.push({
      label: t('common.delete'),
      class: 'btn--danger',
      onClick: () => {
        confirmDialog(t('discounts.deleteBody', { code: d.code }), { title: t('discounts.deleteTitle'), okLabel: t('common.delete'), danger: true })
          .then((ok) => {
            if (!ok) return;
            ctx.store.update((s) => {
              s.discounts = s.discounts.filter((x) => x.code !== d.code);
              if (s.cart.code === d.code) s.cart.code = '';
            });
            m.close();
            toast(t('discounts.deleted', { code: d.code }), '');
            done();
          });
        return true;
      },
    });
  }
  actions.push({
    label: d ? t('discounts.save') : t('discounts.create'),
    class: 'btn--primary',
    onClick: () => {
      const c = code.value.trim().toUpperCase().replace(/\s+/g, '');
      const v = Number(value.value);
      if (!/^[A-Z0-9]{3,16}$/.test(c)) { err.textContent = t('discounts.badCode'); err.hidden = false; return true; }
      if (!(v > 0)) { err.textContent = t('discounts.badValue'); err.hidden = false; return true; }
      if (kind.value === 'pct' && v > 60) { err.textContent = t('discounts.badPct'); err.hidden = false; return true; }
      if (!d && ctx.state.discounts.some((x) => x.code === c)) { err.textContent = t('discounts.exists'); err.hidden = false; return true; }
      ctx.store.update((s) => {
        const payload = {
          code: c, kind: kind.value, value: v,
          minOrder: Math.max(0, Number(minOrder.value) || 0),
          maxUses: Math.max(0, Number(maxUses.value) || 0),
          note: note.value.trim() || 'Added from the operations side',
        };
        if (d) {
          const target = s.discounts.find((x) => x.code === d.code);
          if (target) Object.assign(target, payload);
          if (s.cart.code === d.code) s.cart.code = payload.code;
        } else {
          s.discounts.push({ ...payload, active: true, uses: 0 });
        }
      });
      toast(d ? t('discounts.saved', { code: c }) : t('discounts.live', { code: c }), 'ok');
      done();
      return false;
    },
  });

  const m = modal({
    title: d ? t('discounts.editTitle', { code: d.code }) : t('discounts.newTitle'),
    body: h('div', {},
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.code')), code),
      h('div', { class: 'grid g2', style: 'margin-top:14px;gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('discounts.type')), kind),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('discounts.value')), value),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('discounts.minBasket')), minOrder),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('discounts.maxUses')), maxUses)),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.note')), note),
      err),
    actions,
  });
}

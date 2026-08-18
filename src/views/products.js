/* Operations — products and inventory, with low-stock flags. */

import { h, icon, money, num, pct, modal, toast, confirmDialog, downloadCSV } from '../../lib/ui.js';
import { CATEGORIES, lowStock, dayKey } from '../data.js';
import { tile } from '../cart.js';
import { t } from '../main.js';
import { catName, tr } from '../strings.js';

export default function renderProducts(ctx) {
  const wrap = h('div', {});
  const f = { term: '', cat: 'all', lowOnly: false };

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.products.title')),
      h('p', {}, t('products.sub', { limit: ctx.state.settings.lowStockAt }))),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', html: `${icon('download')}<span>${t('common.exportCsv')}</span>`, onclick: () => exportRows(ctx) }),
      h('button', { class: 'btn btn--primary', type: 'button', html: `${icon('plus')}<span>${t('products.add')}</span>`, onclick: () => editProduct(ctx, null, paint) }))));

  const stats = h('div', { class: 'grid g4', style: 'margin-bottom:20px' });
  wrap.appendChild(stats);

  const search = h('input', { class: 'input', type: 'search', placeholder: t('products.search'), 'aria-label': t('products.searchAria') });
  search.addEventListener('input', () => { f.term = search.value.trim().toLowerCase(); paint(); });
  const catSel = h('select', { class: 'select', 'aria-label': t('common.category') },
    h('option', { value: 'all' }, t('products.allCategories')),
    ...CATEGORIES.map((c) => h('option', { value: c.id }, catName(c.id))));
  catSel.addEventListener('change', () => { f.cat = catSel.value; paint(); });
  const lowChip = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, t('products.lowOnly'));
  lowChip.addEventListener('click', () => {
    f.lowOnly = !f.lowOnly;
    lowChip.classList.toggle('is-on', f.lowOnly);
    lowChip.setAttribute('aria-pressed', String(f.lowOnly));
    paint();
  });

  wrap.appendChild(h('div', { class: 'filters' },
    h('div', { class: 'search' }, h('span', { html: icon('search') }), search),
    catSel, lowChip));

  const host = h('div', {});
  wrap.appendChild(host);

  function rows() {
    const limit = ctx.state.settings.lowStockAt;
    return ctx.state.products.filter((p) => {
      if (f.cat !== 'all' && p.category !== f.cat) return false;
      if (f.lowOnly && p.stock > limit) return false;
      if (f.term && !`${p.name} ${p.sku}`.toLowerCase().includes(f.term)) return false;
      return true;
    });
  }

  function paint() {
    const s = ctx.state;
    const low = lowStock(s);
    const stockValue = s.products.reduce((sum, p) => sum + p.stock * p.cost, 0);
    stats.innerHTML = '';
    [
      [t('products.listed'), num(s.products.filter((p) => p.active).length), t('products.inCatalogue', { n: num(s.products.length) })],
      [t('products.lowOrOut'), num(low.length), low.length ? t('products.atZero', { n: low.filter((p) => p.stock === 0).length }) : t('products.nothingToReorder')],
      [t('products.stockAtCost'), money(stockValue, ctx.currency()), t('products.everyLine')],
      [t('products.avgMargin'), pct(avgMargin(s.products), 1), t('products.priceVsCost')],
    ].forEach(([label, value, delta], i) => stats.appendChild(h('div', { class: `stat${i === 1 && low.length ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, label),
      h('div', { class: 'stat__value' }, value),
      h('div', { class: 'stat__delta' }, delta))));

    const list = rows();
    host.innerHTML = '';
    if (!list.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, t('products.emptyH')), h('p', {}, t('products.emptyP'))));
      return;
    }
    const limit = ctx.state.settings.lowStockAt;
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, t('common.product')), h('th', {}, t('common.sku')), h('th', {}, t('common.category')),
        h('th', { class: 'right' }, t('common.price')), h('th', { class: 'right' }, t('common.cost')), h('th', { class: 'right' }, t('common.margin')),
        h('th', {}, t('common.stock')), h('th', {}, t('common.state')), h('th', { class: 'right' }, t('common.action')))),
      h('tbody', {}, list.map((p) => h('tr', {},
        h('td', {}, h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          tile(p, 'tile--sm'),
          h('span', { class: 'linkish', role: 'button', tabindex: '0', onclick: () => editProduct(ctx, p, paint), onkeydown: (e) => { if (e.key === 'Enter') editProduct(ctx, p, paint); } }, p.name))),
        h('td', { class: 'mono small', dir: 'ltr' }, p.sku),
        h('td', { class: 'small muted' }, catName(p.category)),
        h('td', { class: 'right mono' }, money(p.price, ctx.currency())),
        h('td', { class: 'right mono' }, money(p.cost, ctx.currency())),
        h('td', { class: 'right mono' }, pct(((p.price - p.cost) / p.price) * 100, 0)),
        h('td', {}, h('div', { class: 'stockcell' },
          h('span', { class: 'mono', style: 'min-width:26px' }, String(p.stock)),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => restock(ctx, p, 10, paint) }, '+10'),
          h('button', {
            class: 'btn btn--sm', type: 'button', 'aria-label': t('products.removeOne', { name: p.name }),
            onclick: () => restock(ctx, p, -1, paint),
          }, '−1'))),
        h('td', {}, p.stock === 0
          ? h('span', { class: 'pill pill--bad' }, t('products.outOfStock'))
          : p.stock <= limit
            ? h('span', { class: 'pill pill--warn' }, t('products.lowStock'))
            : p.active ? h('span', { class: 'pill pill--ok' }, t('products.stateListed')) : h('span', { class: 'pill' }, t('products.stateHidden'))),
        h('td', { class: 'right' }, h('div', { class: 'rowbtns' },
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => toggleActive(ctx, p, paint) }, p.active ? t('products.hide') : t('products.list')),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => editProduct(ctx, p, paint) }, t('common.edit'))))))));
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, table));
  }

  paint();
  return wrap;
}

function avgMargin(products) {
  if (!products.length) return 0;
  const total = products.reduce((s, p) => s + ((p.price - p.cost) / p.price) * 100, 0);
  return total / products.length;
}

function restock(ctx, p, delta, done) {
  ctx.store.update((s) => {
    const target = s.products.find((x) => x.id === p.id);
    if (target) target.stock = Math.max(0, target.stock + delta);
  });
  done();
}

function toggleActive(ctx, p, done) {
  ctx.store.update((s) => {
    const target = s.products.find((x) => x.id === p.id);
    if (target) target.active = !target.active;
  });
  toast(p.active ? t('products.hidden', { name: p.name }) : t('products.shown', { name: p.name }), 'ok');
  done();
}

function editProduct(ctx, p, done) {
  const name = h('input', { class: 'input', value: p ? p.name : '', placeholder: t('products.namePh'), 'aria-label': t('products.namePh') });
  const cat = h('select', { class: 'select', 'aria-label': t('common.category') },
    ...CATEGORIES.map((c) => h('option', { value: c.id, selected: p && p.category === c.id }, catName(c.id))));
  const price = h('input', { class: 'input', type: 'number', min: '1', value: p ? String(p.price) : '', 'aria-label': t('common.price') });
  const cost = h('input', { class: 'input', type: 'number', min: '0', value: p ? String(p.cost) : '', 'aria-label': t('common.cost') });
  const stock = h('input', { class: 'input', type: 'number', min: '0', value: p ? String(p.stock) : '0', 'aria-label': t('common.stock') });
  const desc = h('textarea', { class: 'textarea', placeholder: t('products.descPh'), 'aria-label': t('products.descAria') }, p ? tr('productDesc', p.description) : '');
  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const actions = [{ label: t('common.close') }];
  if (p) {
    actions.push({
      label: t('common.delete'),
      class: 'btn--danger',
      onClick: () => {
        confirmDialog(t('products.deleteBody', { name: p.name }), { title: t('products.deleteTitle'), okLabel: t('common.delete'), danger: true })
          .then((ok) => {
            if (!ok) return;
            ctx.store.update((s) => { s.products = s.products.filter((x) => x.id !== p.id); s.cart.items = s.cart.items.filter((it) => it.productId !== p.id); });
            m.close();
            toast(t('products.deleted', { name: p.name }), '');
            done();
          });
        return true;
      },
    });
  }
  actions.push({
    label: p ? t('products.save') : t('products.add'),
    class: 'btn--primary',
    onClick: () => {
      const n = name.value.trim();
      const pr = Number(price.value);
      const co = Number(cost.value);
      const st = Math.max(0, Number(stock.value) || 0);
      if (!n) { err.textContent = t('products.needName'); err.hidden = false; return true; }
      if (!(pr > 0)) { err.textContent = t('products.needPrice'); err.hidden = false; return true; }
      if (co < 0 || co >= pr) { err.textContent = t('products.needCost'); err.hidden = false; return true; }
      ctx.store.update((s) => {
        const tone = (CATEGORIES.find((c) => c.id === cat.value) || {}).tone || 6;
        if (p) {
          const target = s.products.find((x) => x.id === p.id);
          if (target) Object.assign(target, { name: n, category: cat.value, tone, price: pr, cost: co, stock: st, description: desc.value.trim() });
        } else {
          const nextNo = s.products.length + 1;
          s.products.push({
            id: `P${String(Date.now()).slice(-6)}`,
            sku: `${cat.value.slice(0, 3).toUpperCase()}-${String(nextNo).padStart(3, '0')}`,
            name: n, category: cat.value, tone, price: pr, cost: co, stock: st,
            description: desc.value.trim() || t('products.addedFromOps'),
            active: true, prepMins: 6,
          });
        }
      });
      toast(p ? t('products.updated', { name: n }) : t('products.added', { name: n }), 'ok');
      done();
      return false;
    },
  });

  const m = modal({
    title: p ? p.name : t('products.newTitle'),
    body: h('div', {},
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.name')), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.category')), cat),
      h('div', { class: 'grid g3', style: 'margin-top:14px;gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('common.price')), price),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('common.cost')), cost),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('common.stock')), stock)),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('products.description')), desc),
      err),
    actions,
  });
}

function exportRows(ctx) {
  const head = t('products.csvHead');
  const body = ctx.state.products.map((p) => [p.sku, p.name, p.category, p.price, p.cost, p.stock, p.active ? t('products.csvYes') : t('products.csvNo')]);
  downloadCSV(`cartline-inventory-${dayKey(new Date())}.csv`, [head, ...body]);
  toast(t('products.exported'), 'ok');
}

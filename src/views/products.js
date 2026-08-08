/* Operations — products and inventory, with low-stock flags. */

import { h, icon, money, num, pct, modal, toast, confirmDialog, downloadCSV } from '../../lib/ui.js';
import { CATEGORIES, lowStock, dayKey } from '../data.js';
import { tile } from '../cart.js';

export default function renderProducts(ctx) {
  const wrap = h('div', {});
  const f = { term: '', cat: 'all', lowOnly: false };

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Products and stock'),
      h('p', {}, `Anything at or below ${ctx.state.settings.lowStockAt} units is flagged low. Stock comes down when the storefront takes an order and goes back up on a cancel or a restock.`)),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', html: `${icon('download')}<span>Export CSV</span>`, onclick: () => exportRows(ctx) }),
      h('button', { class: 'btn btn--primary', type: 'button', html: `${icon('plus')}<span>Add product</span>`, onclick: () => editProduct(ctx, null, paint) }))));

  const stats = h('div', { class: 'grid g4', style: 'margin-bottom:20px' });
  wrap.appendChild(stats);

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Product or SKU', 'aria-label': 'Search products' });
  search.addEventListener('input', () => { f.term = search.value.trim().toLowerCase(); paint(); });
  const catSel = h('select', { class: 'select', 'aria-label': 'Category' },
    h('option', { value: 'all' }, 'All categories'),
    ...CATEGORIES.map((c) => h('option', { value: c.id }, c.name)));
  catSel.addEventListener('change', () => { f.cat = catSel.value; paint(); });
  const lowChip = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, 'Low stock only');
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
    const stockValue = s.products.reduce((t, p) => t + p.stock * p.cost, 0);
    stats.innerHTML = '';
    [
      ['Products listed', num(s.products.filter((p) => p.active).length), `${num(s.products.length)} in the catalogue`],
      ['Low or out of stock', num(low.length), low.length ? `${low.filter((p) => p.stock === 0).length} at zero` : 'Nothing to reorder'],
      ['Stock at cost', money(stockValue, ctx.currency()), 'Across every line'],
      ['Average margin', pct(avgMargin(s.products), 1), 'Price against cost'],
    ].forEach(([label, value, delta], i) => stats.appendChild(h('div', { class: `stat${i === 1 && low.length ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, label),
      h('div', { class: 'stat__value' }, value),
      h('div', { class: 'stat__delta' }, delta))));

    const list = rows();
    host.innerHTML = '';
    if (!list.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No products match'), h('p', {}, 'Clear the filters to see the whole catalogue.')));
      return;
    }
    const limit = ctx.state.settings.lowStockAt;
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Product'), h('th', {}, 'SKU'), h('th', {}, 'Category'),
        h('th', { class: 'right' }, 'Price'), h('th', { class: 'right' }, 'Cost'), h('th', { class: 'right' }, 'Margin'),
        h('th', {}, 'Stock'), h('th', {}, 'State'), h('th', { class: 'right' }, 'Action'))),
      h('tbody', {}, list.map((p) => h('tr', {},
        h('td', {}, h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          tile(p, 'tile--sm'),
          h('span', { class: 'linkish', role: 'button', tabindex: '0', onclick: () => editProduct(ctx, p, paint), onkeydown: (e) => { if (e.key === 'Enter') editProduct(ctx, p, paint); } }, p.name))),
        h('td', { class: 'mono small' }, p.sku),
        h('td', { class: 'small muted' }, catName(p.category)),
        h('td', { class: 'right mono' }, money(p.price, ctx.currency())),
        h('td', { class: 'right mono' }, money(p.cost, ctx.currency())),
        h('td', { class: 'right mono' }, pct(((p.price - p.cost) / p.price) * 100, 0)),
        h('td', {}, h('div', { class: 'stockcell' },
          h('span', { class: 'mono', style: 'min-width:26px' }, String(p.stock)),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => restock(ctx, p, 10, paint) }, '+10'),
          h('button', {
            class: 'btn btn--sm', type: 'button', 'aria-label': `Remove one ${p.name} from stock`,
            onclick: () => restock(ctx, p, -1, paint),
          }, '−1'))),
        h('td', {}, p.stock === 0
          ? h('span', { class: 'pill pill--bad' }, 'Out of stock')
          : p.stock <= limit
            ? h('span', { class: 'pill pill--warn' }, 'Low stock')
            : p.active ? h('span', { class: 'pill pill--ok' }, 'Listed') : h('span', { class: 'pill' }, 'Hidden')),
        h('td', { class: 'right' }, h('div', { class: 'rowbtns' },
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => toggleActive(ctx, p, paint) }, p.active ? 'Hide' : 'List'),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => editProduct(ctx, p, paint) }, 'Edit')))))));
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, table));
  }

  paint();
  return wrap;
}

function avgMargin(products) {
  if (!products.length) return 0;
  const t = products.reduce((s, p) => s + ((p.price - p.cost) / p.price) * 100, 0);
  return t / products.length;
}

function catName(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.name : id;
}

function restock(ctx, p, delta, done) {
  ctx.store.update((s) => {
    const t = s.products.find((x) => x.id === p.id);
    if (t) t.stock = Math.max(0, t.stock + delta);
  });
  done();
}

function toggleActive(ctx, p, done) {
  ctx.store.update((s) => {
    const t = s.products.find((x) => x.id === p.id);
    if (t) t.active = !t.active;
  });
  toast(`${p.name} ${p.active ? 'hidden from the storefront' : 'listed on the storefront'}`, 'ok');
  done();
}

function editProduct(ctx, p, done) {
  const name = h('input', { class: 'input', value: p ? p.name : '', placeholder: 'Product name', 'aria-label': 'Product name' });
  const cat = h('select', { class: 'select', 'aria-label': 'Category' },
    ...CATEGORIES.map((c) => h('option', { value: c.id, selected: p && p.category === c.id }, c.name)));
  const price = h('input', { class: 'input', type: 'number', min: '1', value: p ? String(p.price) : '', 'aria-label': 'Price' });
  const cost = h('input', { class: 'input', type: 'number', min: '0', value: p ? String(p.cost) : '', 'aria-label': 'Cost' });
  const stock = h('input', { class: 'input', type: 'number', min: '0', value: p ? String(p.stock) : '0', 'aria-label': 'Stock' });
  const desc = h('textarea', { class: 'textarea', placeholder: 'One plain line about the product', 'aria-label': 'Description' }, p ? p.description : '');
  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const actions = [{ label: 'Close' }];
  if (p) {
    actions.push({
      label: 'Delete',
      class: 'btn--danger',
      onClick: () => {
        confirmDialog(`Remove ${p.name} from the catalogue? Past orders keep their line, only the listing goes.`, { title: 'Delete product', okLabel: 'Delete', danger: true })
          .then((ok) => {
            if (!ok) return;
            ctx.store.update((s) => { s.products = s.products.filter((x) => x.id !== p.id); s.cart.items = s.cart.items.filter((it) => it.productId !== p.id); });
            m.close();
            toast(`${p.name} deleted`, '');
            done();
          });
        return true;
      },
    });
  }
  actions.push({
    label: p ? 'Save changes' : 'Add product',
    class: 'btn--primary',
    onClick: () => {
      const n = name.value.trim();
      const pr = Number(price.value);
      const co = Number(cost.value);
      const st = Math.max(0, Number(stock.value) || 0);
      if (!n) { err.textContent = 'A product needs a name.'; err.hidden = false; return true; }
      if (!(pr > 0)) { err.textContent = 'Price has to be more than zero.'; err.hidden = false; return true; }
      if (co < 0 || co >= pr) { err.textContent = 'Cost has to be below the price.'; err.hidden = false; return true; }
      ctx.store.update((s) => {
        const tone = (CATEGORIES.find((c) => c.id === cat.value) || {}).tone || 6;
        if (p) {
          const t = s.products.find((x) => x.id === p.id);
          if (t) Object.assign(t, { name: n, category: cat.value, tone, price: pr, cost: co, stock: st, description: desc.value.trim() });
        } else {
          const nextNo = s.products.length + 1;
          s.products.push({
            id: `P${String(Date.now()).slice(-6)}`,
            sku: `${cat.value.slice(0, 3).toUpperCase()}-${String(nextNo).padStart(3, '0')}`,
            name: n, category: cat.value, tone, price: pr, cost: co, stock: st,
            description: desc.value.trim() || 'Added from the operations side.',
            active: true, prepMins: 6,
          });
        }
      });
      toast(p ? `${n} updated` : `${n} added to the catalogue`, 'ok');
      done();
      return false;
    },
  });

  const m = modal({
    title: p ? p.name : 'New product',
    body: h('div', {},
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Category'), cat),
      h('div', { class: 'grid g3', style: 'margin-top:14px;gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Price'), price),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Cost'), cost),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Stock'), stock)),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Description'), desc),
      err),
    actions,
  });
}

function exportRows(ctx) {
  const head = ['SKU', 'Product', 'Category', 'Price', 'Cost', 'Stock', 'Listed'];
  const body = ctx.state.products.map((p) => [p.sku, p.name, p.category, p.price, p.cost, p.stock, p.active ? 'yes' : 'no']);
  downloadCSV(`cartline-inventory-${dayKey(new Date())}.csv`, [head, ...body]);
  toast('Inventory exported', 'ok');
}

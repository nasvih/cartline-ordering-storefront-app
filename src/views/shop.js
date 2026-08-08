/* Storefront — category filter, product grid, product modal. */

import { h, icon, money, modal, toast } from '../../lib/ui.js';
import { CATEGORIES } from '../data.js';
import { addToCart, cartCount, initialsOf, stepper, showCart } from '../cart.js';

export default function renderShop(ctx) {
  const wrap = h('div', {});
  const s = ctx.state;
  const cur = s.settings.currency;
  let cat = 'all';
  let term = '';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, s.settings.storeName),
      h('p', {}, `${s.settings.tagline}. Orders placed here go straight to the operations board, stock comes down, and the day summary moves with them.`)),
    h('div', { class: 'btnrow' },
      h('span', { class: `pill ${s.settings.acceptingOrders ? 'pill--ok' : 'pill--bad'}` },
        s.settings.acceptingOrders ? 'Accepting orders' : 'Closed for orders'),
      h('button', {
        class: 'btn', type: 'button', onclick: () => showCart(ctx),
        html: `${icon('cart')}<span>Cart</span>`,
      }))));

  if (!s.settings.acceptingOrders) {
    wrap.appendChild(h('div', { class: 'banner', style: 'margin-bottom:16px' },
      h('span', { html: icon('alert') }),
      h('div', {}, 'The store is switched off in Store settings, so checkout is blocked. Turn it back on to place an order.')));
  }

  const search = h('div', { class: 'search' }, h('span', { html: icon('search') }),
    h('input', {
      class: 'input', type: 'search', placeholder: 'Search the menu', 'aria-label': 'Search products',
      oninput: (e) => { term = e.target.value.trim().toLowerCase(); paint(); },
    }));

  const chips = h('div', { class: 'catrow' });
  const cats = [{ id: 'all', name: 'Everything' }, ...CATEGORIES];
  cats.forEach((c) => {
    chips.appendChild(h('button', {
      class: `chip${c.id === cat ? ' is-on' : ''}`, type: 'button', dataset: { cat: c.id },
      'aria-pressed': String(c.id === cat),
      onclick: () => {
        cat = c.id;
        [...chips.children].forEach((b) => {
          const on = b.dataset.cat === cat;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        paint();
      },
    }, c.name));
  });

  wrap.appendChild(h('div', { class: 'shopbar' }, search, chips));

  const count = h('p', { class: 'label', style: 'margin-bottom:10px' }, '');
  const grid = h('div', { class: 'prods' });
  wrap.appendChild(count);
  wrap.appendChild(grid);

  function paint() {
    const list = ctx.state.products.filter((p) => p.active
      && (cat === 'all' || p.category === cat)
      && (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term)));
    count.textContent = `${list.length} of ${ctx.state.products.filter((p) => p.active).length} products`;
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(h('div', { class: 'empty', style: 'grid-column:1/-1' },
        h('h3', {}, 'Nothing matches that'),
        h('p', {}, 'Clear the search or pick another category.')));
      return;
    }
    list.forEach((p) => grid.appendChild(card(p)));
  }

  function stockPill(p) {
    if (p.stock <= 0) return h('span', { class: 'pill pill--bad' }, 'Sold out');
    if (p.stock <= ctx.state.settings.lowStockAt) return h('span', { class: 'pill pill--warn' }, `Last ${p.stock}`);
    return h('span', { class: 'pill pill--ok' }, 'In stock');
  }

  function card(p) {
    const soldOut = p.stock <= 0;
    return h('button', {
      class: `prod${soldOut ? ' prod--off' : ''}`, type: 'button',
      'aria-label': `${p.name}, ${money(p.price, ctx.currency())}`,
      onclick: () => openProduct(p),
    },
    h('span', { class: `tile tone-${p.tone}` }, initialsOf(p.name)),
    h('span', { class: 'prod__body' },
      h('span', { class: 'prod__name' }, p.name),
      h('span', { class: 'small muted' }, catName(p.category)),
      h('span', { class: 'prod__foot' },
        h('span', { class: 'prod__price' }, money(p.price, ctx.currency())),
        stockPill(p))));
  }

  function openProduct(p) {
    let qty = 1;
    const soldOut = p.stock <= 0 || !ctx.state.settings.acceptingOrders;
    const body = h('div', {},
      h('div', { class: `tile tile--lg tone-${p.tone}`, style: 'margin-bottom:14px' }, initialsOf(p.name)),
      h('div', { class: 'between', style: 'align-items:flex-start' },
        h('div', {}, h('h3', {}, p.name), h('p', { class: 'small muted' }, catName(p.category))),
        h('span', { class: 'prod__price' }, money(p.price, ctx.currency()))),
      h('p', { class: 'muted', style: 'margin-top:10px' }, p.description),
      h('div', { class: 'row', style: 'margin-top:14px' },
        stockPill(p),
        h('span', { class: 'pill' }, `${p.prepMins} min prep`),
        h('span', { class: 'pill' }, p.sku)),
      h('div', { class: 'row', style: 'margin-top:16px' },
        h('span', { class: 'label' }, 'Quantity'),
        stepper(1, (n) => { qty = n; }, Math.max(1, p.stock))));

    modal({
      title: 'Product',
      body,
      actions: [
        { label: 'Close' },
        {
          label: soldOut ? 'Unavailable' : 'Add to cart',
          class: 'btn--primary',
          onClick: () => {
            if (soldOut) { toast('That one cannot be added right now', 'bad'); return true; }
            if (qty < 1) { toast('Pick at least one', 'bad'); return true; }
            const ok = addToCart(ctx.store, p.id, qty);
            if (!ok) { toast(`Only ${p.stock} left in stock`, 'bad'); return true; }
            toast(`${qty} × ${p.name} added — ${cartCount(ctx.state)} in the cart`, 'ok');
            ctx.syncChrome();
            return false;
          },
        },
      ],
    });
  }

  paint();
  return wrap;
}

function catName(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.name : id;
}

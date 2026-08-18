/* Storefront — category filter, product grid, product modal. */

import { h, icon, money, modal, toast } from '../../lib/ui.js';
import { CATEGORIES } from '../data.js';
import { addToCart, cartCount, tile, stepper, showCart } from '../cart.js';
import { t } from '../main.js';
import { catName, tr } from '../strings.js';

export default function renderShop(ctx) {
  const wrap = h('div', {});
  const s = ctx.state;
  const cur = s.settings.currency;
  let cat = 'all';
  let term = '';

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, s.settings.storeName),
      h('p', {}, t('shop.sub', { tagline: tr('settingsText', s.settings.tagline) }))),
    h('div', { class: 'btnrow' },
      h('span', { class: `pill ${s.settings.acceptingOrders ? 'pill--ok' : 'pill--bad'}` },
        s.settings.acceptingOrders ? t('shop.accepting') : t('shop.closed')),
      h('button', {
        class: 'btn', type: 'button', onclick: () => showCart(ctx),
        html: `${icon('cart')}<span>${t('shop.cart')}</span>`,
      }))));

  if (!s.settings.acceptingOrders) {
    wrap.appendChild(h('div', { class: 'banner', style: 'margin-bottom:16px' },
      h('span', { html: icon('alert') }),
      h('div', {}, t('shop.offBanner'))));
  }

  const search = h('div', { class: 'search' }, h('span', { html: icon('search') }),
    h('input', {
      class: 'input', type: 'search', placeholder: t('shop.search'), 'aria-label': t('shop.searchAria'),
      oninput: (e) => { term = e.target.value.trim().toLowerCase(); paint(); },
    }));

  const chips = h('div', { class: 'catrow' });
  const cats = [{ id: 'all', name: t('shop.everything') }, ...CATEGORIES.map((c) => ({ id: c.id, name: catName(c.id) }))];
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
    count.textContent = t('shop.countLine', { shown: list.length, all: ctx.state.products.filter((p) => p.active).length });
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(h('div', { class: 'empty', style: 'grid-column:1/-1' },
        h('h3', {}, t('shop.emptyH')),
        h('p', {}, t('shop.emptyP'))));
      return;
    }
    list.forEach((p) => grid.appendChild(card(p)));
  }

  function stockPill(p) {
    if (p.stock <= 0) return h('span', { class: 'pill pill--bad' }, t('shop.soldOut'));
    if (p.stock <= ctx.state.settings.lowStockAt) return h('span', { class: 'pill pill--warn' }, t('shop.lastN', { n: p.stock }));
    return h('span', { class: 'pill pill--ok' }, t('shop.inStock'));
  }

  function card(p) {
    const soldOut = p.stock <= 0;
    return h('button', {
      class: `prod${soldOut ? ' prod--off' : ''}`, type: 'button',
      'aria-label': t('shop.cardAria', { name: p.name, price: money(p.price, ctx.currency()) }),
      onclick: () => openProduct(p),
    },
    tile(p),
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
    const hero = tile(p, 'tile--lg');
    hero.style.marginBottom = '14px';
    const body = h('div', {},
      hero,
      h('div', { class: 'between', style: 'align-items:flex-start' },
        h('div', {}, h('h3', {}, p.name), h('p', { class: 'small muted' }, catName(p.category))),
        h('span', { class: 'prod__price' }, money(p.price, ctx.currency()))),
      h('p', { class: 'muted', style: 'margin-top:10px' }, tr('productDesc', p.description)),
      h('div', { class: 'row', style: 'margin-top:14px' },
        stockPill(p),
        h('span', { class: 'pill' }, t('shop.prep', { n: p.prepMins })),
        h('span', { class: 'pill mono', dir: 'ltr' }, p.sku)),
      h('div', { class: 'row', style: 'margin-top:16px' },
        h('span', { class: 'label' }, t('shop.quantity')),
        stepper(1, (n) => { qty = n; }, Math.max(1, p.stock))));

    modal({
      title: t('shop.modalTitle'),
      body,
      actions: [
        { label: t('common.close') },
        {
          label: soldOut ? t('shop.unavailable') : t('shop.add'),
          class: 'btn--primary',
          onClick: () => {
            if (soldOut) { toast(t('shop.cannotAdd'), 'bad'); return true; }
            if (qty < 1) { toast(t('shop.atLeastOne'), 'bad'); return true; }
            const ok = addToCart(ctx.store, p.id, qty);
            if (!ok) { toast(t('shop.onlyLeft', { n: p.stock }), 'bad'); return true; }
            toast(t('shop.added', { qty, name: p.name, total: cartCount(ctx.state) }), 'ok');
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


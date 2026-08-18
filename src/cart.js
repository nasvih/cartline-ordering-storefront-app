/* ============================================================
   Cart: the shared basket used by the storefront, the cart drawer
   and checkout. Lives in the store, so it survives a reload.
   ============================================================ */

import { h, icon, money, toast } from '../lib/ui.js';
import { priceCart, productById, discountByCode, productImage } from './data.js';
import { t } from './main.js';

export function cartLines(state) {
  return state.cart.items.map((it) => {
    const p = productById(state, it.productId);
    return p ? { productId: p.id, name: p.name, price: p.price, qty: it.qty, category: p.category, tone: p.tone, stock: p.stock } : null;
  }).filter(Boolean);
}

export const cartCount = (state) => state.cart.items.reduce((s, it) => s + it.qty, 0);

export function cartTotals(state) {
  const lines = cartLines(state);
  const code = state.cart.code ? discountByCode(state, state.cart.code) : null;
  const totals = priceCart(lines, state.settings, code);
  return { ...totals, lines, code };
}

export function addToCart(store, productId, qty = 1) {
  let ok = true;
  store.update((s) => {
    const p = productById(s, productId);
    if (!p) { ok = false; return; }
    const line = s.cart.items.find((it) => it.productId === productId);
    const have = line ? line.qty : 0;
    if (have + qty > p.stock) { ok = false; return; }
    if (line) line.qty += qty; else s.cart.items.push({ productId, qty });
  });
  return ok;
}

export function setQty(store, productId, qty) {
  store.update((s) => {
    const p = productById(s, productId);
    const capped = Math.max(0, Math.min(qty, p ? p.stock : qty));
    if (capped === 0) s.cart.items = s.cart.items.filter((it) => it.productId !== productId);
    else {
      const line = s.cart.items.find((it) => it.productId === productId);
      if (line) line.qty = capped; else s.cart.items.push({ productId, qty: capped });
    }
  });
}

export function clearCart(store) {
  store.update((s) => { s.cart = { items: [], code: '' }; });
}

/* ---------- the drawer ---------- */

let openDrawer = null;

export function closeCart() {
  if (openDrawer) { openDrawer.remove(); openDrawer = null; }
}

export function toggleCart(ctx) {
  if (openDrawer) { closeCart(); return; }
  showCart(ctx);
}

export function showCart(ctx) {
  closeCart();
  const scrim = h('div', { class: 'scrim', style: 'place-items:stretch;padding:0' });
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': t('cart.aria') });
  scrim.appendChild(drawer);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeCart(); });
  document.body.appendChild(scrim);
  openDrawer = scrim;

  const paint = () => {
    const { lines, subtotal, discountAmt, tax, total, code } = cartTotals(ctx.state);
    drawer.innerHTML = '';
    drawer.appendChild(h('header', { class: 'drawer__head' },
      h('h3', { style: 'flex:1' }, t('cart.title')),
      h('span', { class: 'pill' }, t('cart.count', { n: lines.reduce((s, l) => s + l.qty, 0) })),
      h('button', {
        class: 'btn btn--ghost btn--icon', 'aria-label': t('cart.close'),
        onclick: closeCart, html: icon('x'),
      })));

    const body = h('div', { class: 'drawer__body' });
    if (!lines.length) {
      body.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('cart.emptyH')),
        h('p', {}, t('cart.emptyP'))));
    } else {
      lines.forEach((l) => {
        body.appendChild(h('div', { class: 'cartline' },
          tile(l, 'tile--sm'),
          h('div', { class: 'cartline__main' },
            h('div', { class: 'cartline__name' }, l.name),
            h('div', { class: 'small muted mono' }, t('cart.each', { money: money(l.price, ctx.state.settings.currency) })),
            h('div', { class: 'row', style: 'margin-top:7px' },
              stepper(l.qty, (n) => { setQty(ctx.store, l.productId, n); paint(); ctx.syncChrome(); }, l.stock),
              h('button', {
                class: 'btn btn--ghost btn--sm', type: 'button',
                onclick: () => { setQty(ctx.store, l.productId, 0); paint(); ctx.syncChrome(); },
              }, t('cart.remove')))),
          h('div', { class: 'mono', style: 'font-weight:600' }, money(l.price * l.qty, ctx.state.settings.currency))));
      });

      const codeInput = h('input', {
        class: 'input', placeholder: t('cart.code'), value: ctx.state.cart.code || '',
        'aria-label': t('cart.code'),
      });
      body.appendChild(h('div', { class: 'codebox' }, codeInput,
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            const raw = codeInput.value.trim().toUpperCase();
            if (!raw) { ctx.store.update((s) => { s.cart.code = ''; }); paint(); return; }
            const d = discountByCode(ctx.state, raw);
            if (!d || !d.active) { toast(t('cart.notActive'), 'bad'); return; }
            if (subtotal < d.minOrder) {
              toast(t('cart.needs', { code: raw, money: money(d.minOrder, ctx.state.settings.currency) }), 'bad');
              return;
            }
            ctx.store.update((s) => { s.cart.code = raw; });
            toast(t('cart.applied', { code: raw }), 'ok');
            paint();
          },
        }, t('cart.apply'))));
      if (code && discountAmt > 0) {
        body.appendChild(h('p', { class: 'hint' }, t('cart.codeHint', {
          code: code.code,
          off: code.kind === 'pct'
            ? t('cart.pctOff', { value: code.value })
            : t('cart.flatOff', { money: money(code.value, ctx.state.settings.currency) }),
          min: money(code.minOrder, ctx.state.settings.currency),
        })));
      }

      body.appendChild(h('div', { class: 'totals' },
        totalRow(t('common.subtotal'), money(subtotal, ctx.state.settings.currency)),
        discountAmt ? totalRow(t('cart.discountRow', { code: code ? code.code : '' }), `− ${money(discountAmt, ctx.state.settings.currency)}`) : null,
        totalRow(t('cart.taxRow', { pct: ctx.state.settings.taxPct }), money(tax, ctx.state.settings.currency)),
        h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, t('common.total')), h('strong', {}, money(total, ctx.state.settings.currency)))));
    }
    drawer.appendChild(body);

    drawer.appendChild(h('div', { class: 'drawer__foot' },
      h('button', {
        class: 'btn btn--primary btn--block', type: 'button', disabled: !lines.length,
        onclick: () => { closeCart(); ctx.nav('checkout'); },
      }, t('cart.checkout')),
      lines.length ? h('button', {
        class: 'btn btn--ghost btn--block', type: 'button', style: 'margin-top:8px',
        onclick: () => { clearCart(ctx.store); paint(); ctx.syncChrome(); },
      }, t('cart.clear')) : null));
  };

  paint();
  return { close: closeCart, repaint: paint };
}

export function stepper(value, onChange, max = 99) {
  const out = h('output', {}, String(value));
  const set = (n) => { const v = Math.max(0, Math.min(n, max)); out.textContent = String(v); onChange(v); };
  return h('div', { class: 'qty' },
    h('button', { type: 'button', 'aria-label': t('cart.dec'), onclick: () => set(Number(out.textContent) - 1), html: '<svg viewBox="0 0 20 20"><path d="M4 10h12"/></svg>' }),
    out,
    h('button', { type: 'button', 'aria-label': t('cart.inc'), onclick: () => set(Number(out.textContent) + 1), html: icon('plus') }));
}

export function totalRow(label, value) {
  return h('div', { class: 'totals__row' }, h('span', {}, label), h('strong', {}, value));
}

export function initialsOf(name) {
  return String(name || '?').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

/* ---------- the product tile ----------
   One component for every place a product is pictured: the storefront grid,
   the product modal, the cart drawer, checkout and the operations table. It
   shows the photograph when the product has one and the solid colour tile
   with the product's initials when it does not — and it drops back to that
   same tile if the file ever fails to load, so the grid never shows a hole. */

export function tile(item, extraClass = '') {
  const id = item && (item.productId || item.id);
  const name = item ? item.name : '';
  const tone = (item && item.tone) || 1;
  const cls = `tile tone-${tone}${extraClass ? ` ${extraClass}` : ''}`;
  const photo = productImage(id);
  const el = h('span', { class: cls }, initialsOf(name));
  if (!photo) return el;
  const img = h('img', { class: 'tile__img', src: photo.src, alt: photo.alt, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => { img.remove(); el.classList.remove('tile--photo'); });
  el.classList.add('tile--photo');
  el.appendChild(img);
  return el;
}

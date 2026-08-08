/* ============================================================
   Cart: the shared basket used by the storefront, the cart drawer
   and checkout. Lives in the store, so it survives a reload.
   ============================================================ */

import { h, icon, money, toast } from '../lib/ui.js';
import { priceCart, productById, discountByCode } from './data.js';

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
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Cart' });
  scrim.appendChild(drawer);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeCart(); });
  document.body.appendChild(scrim);
  openDrawer = scrim;

  const paint = () => {
    const { lines, subtotal, discountAmt, tax, total, code } = cartTotals(ctx.state);
    drawer.innerHTML = '';
    drawer.appendChild(h('header', { class: 'drawer__head' },
      h('h3', { style: 'flex:1' }, 'Your cart'),
      h('span', { class: 'pill' }, `${lines.reduce((s, l) => s + l.qty, 0)} items`),
      h('button', {
        class: 'btn btn--ghost btn--icon', 'aria-label': 'Close cart',
        onclick: closeCart, html: icon('x'),
      })));

    const body = h('div', { class: 'drawer__body' });
    if (!lines.length) {
      body.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'Nothing in the cart yet'),
        h('p', {}, 'Add something from the shop and it will show up here.')));
    } else {
      lines.forEach((l) => {
        body.appendChild(h('div', { class: 'cartline' },
          h('div', { class: `tile tile--sm tone-${l.tone}` }, initialsOf(l.name)),
          h('div', { class: 'cartline__main' },
            h('div', { class: 'cartline__name' }, l.name),
            h('div', { class: 'small muted mono' }, `${money(l.price, ctx.state.settings.currency)} each`),
            h('div', { class: 'row', style: 'margin-top:7px' },
              stepper(l.qty, (n) => { setQty(ctx.store, l.productId, n); paint(); ctx.syncChrome(); }, l.stock),
              h('button', {
                class: 'btn btn--ghost btn--sm', type: 'button',
                onclick: () => { setQty(ctx.store, l.productId, 0); paint(); ctx.syncChrome(); },
              }, 'Remove'))),
          h('div', { class: 'mono', style: 'font-weight:600' }, money(l.price * l.qty, ctx.state.settings.currency))));
      });

      const codeInput = h('input', {
        class: 'input', placeholder: 'Discount code', value: ctx.state.cart.code || '',
        'aria-label': 'Discount code',
      });
      body.appendChild(h('div', { class: 'codebox' }, codeInput,
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            const raw = codeInput.value.trim().toUpperCase();
            if (!raw) { ctx.store.update((s) => { s.cart.code = ''; }); paint(); return; }
            const d = discountByCode(ctx.state, raw);
            if (!d || !d.active) { toast('That code is not active', 'bad'); return; }
            if (subtotal < d.minOrder) {
              toast(`${raw} needs a basket of ${money(d.minOrder, ctx.state.settings.currency)} or more`, 'bad');
              return;
            }
            ctx.store.update((s) => { s.cart.code = raw; });
            toast(`${raw} applied`, 'ok');
            paint();
          },
        }, 'Apply')));
      if (code && discountAmt > 0) {
        body.appendChild(h('p', { class: 'hint' },
          `${code.code} — ${code.kind === 'pct' ? `${code.value}% off` : `${money(code.value, ctx.state.settings.currency)} off`} on baskets over ${money(code.minOrder, ctx.state.settings.currency)}.`));
      }

      body.appendChild(h('div', { class: 'totals' },
        totalRow('Subtotal', money(subtotal, ctx.state.settings.currency)),
        discountAmt ? totalRow(`Discount ${code ? code.code : ''}`, `− ${money(discountAmt, ctx.state.settings.currency)}`) : null,
        totalRow(`Tax ${ctx.state.settings.taxPct}%`, money(tax, ctx.state.settings.currency)),
        h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, 'Total'), h('strong', {}, money(total, ctx.state.settings.currency)))));
    }
    drawer.appendChild(body);

    drawer.appendChild(h('div', { class: 'drawer__foot' },
      h('button', {
        class: 'btn btn--primary btn--block', type: 'button', disabled: !lines.length,
        onclick: () => { closeCart(); ctx.nav('checkout'); },
      }, 'Go to checkout'),
      lines.length ? h('button', {
        class: 'btn btn--ghost btn--block', type: 'button', style: 'margin-top:8px',
        onclick: () => { clearCart(ctx.store); paint(); ctx.syncChrome(); },
      }, 'Empty the cart') : null));
  };

  paint();
  return { close: closeCart, repaint: paint };
}

export function stepper(value, onChange, max = 99) {
  const out = h('output', {}, String(value));
  const set = (n) => { const v = Math.max(0, Math.min(n, max)); out.textContent = String(v); onChange(v); };
  return h('div', { class: 'qty' },
    h('button', { type: 'button', 'aria-label': 'Decrease quantity', onclick: () => set(Number(out.textContent) - 1), html: '<svg viewBox="0 0 20 20"><path d="M4 10h12"/></svg>' }),
    out,
    h('button', { type: 'button', 'aria-label': 'Increase quantity', onclick: () => set(Number(out.textContent) + 1), html: icon('plus') }));
}

export function totalRow(label, value) {
  return h('div', { class: 'totals__row' }, h('span', {}, label), h('strong', {}, value));
}

export function initialsOf(name) {
  return String(name || '?').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

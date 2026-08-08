/* Operations — store settings. Everything here changes the other screens. */

import { h, icon, num, money, toast, confirmDialog } from '../../lib/ui.js';
import { STORAGE_KEY, lowStock, dayKey, daySummary } from '../data.js';
import { closeCart } from '../cart.js';

export default function renderSettings(ctx) {
  const wrap = h('div', {});
  const s = ctx.state.settings;

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Store settings'),
      h('p', {}, 'These values are read by the storefront, the board and the day summary. Change one and the other screens follow.'))));

  const storeName = h('input', { class: 'input', value: s.storeName, 'aria-label': 'Store name' });
  const tagline = h('input', { class: 'input', value: s.tagline, 'aria-label': 'Tagline' });
  const counterName = h('input', { class: 'input', value: s.counterName, 'aria-label': 'Counter name' });
  const taxPct = h('input', { class: 'input', type: 'number', min: '0', max: '28', value: String(s.taxPct), 'aria-label': 'Tax percent' });
  const lowStockAt = h('input', { class: 'input', type: 'number', min: '0', max: '99', value: String(s.lowStockAt), 'aria-label': 'Low stock threshold' });
  const prepMinutes = h('input', { class: 'input', type: 'number', min: '1', max: '120', value: String(s.prepMinutes), 'aria-label': 'Promised preparation minutes' });
  const accepting = h('input', { type: 'checkbox', checked: s.acceptingOrders });

  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const save = () => {
    const tax = Number(taxPct.value);
    const low = Number(lowStockAt.value);
    const prep = Number(prepMinutes.value);
    if (!storeName.value.trim()) { err.textContent = 'The store needs a name.'; err.hidden = false; return; }
    if (tax < 0 || tax > 28) { err.textContent = 'Tax has to sit between 0 and 28 percent.'; err.hidden = false; return; }
    if (low < 0 || prep < 1) { err.textContent = 'Thresholds cannot be negative.'; err.hidden = false; return; }
    err.hidden = true;
    ctx.store.update((st) => {
      Object.assign(st.settings, {
        storeName: storeName.value.trim(),
        tagline: tagline.value.trim(),
        counterName: counterName.value.trim() || 'Counter 1',
        taxPct: tax,
        lowStockAt: low,
        prepMinutes: prep,
        acceptingOrders: accepting.checked,
      });
    });
    toast('Settings saved', 'ok');
    ctx.rerender();
  };

  const today = daySummary(ctx.state, dayKey(new Date()));

  wrap.appendChild(h('div', { class: 'grid g-side' },
    h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Storefront')),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Store name'), storeName),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tagline'), tagline),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Counter name on the timeline'), counterName),
      h('label', { class: 'switch', style: 'margin-top:16px' }, accepting, h('span', { class: 'switch__track' }), h('span', {}, 'Accepting orders')),
      h('hr', { class: 'hr' }),
      h('h3', { style: 'margin-bottom:12px' }, 'Numbers'),
      h('div', { class: 'grid g3', style: 'gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Tax percent'), taxPct),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Low stock at'), lowStockAt),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, 'Prep minutes'), prepMinutes)),
      h('p', { class: 'hint' }, 'Tax is applied after any discount. Prep minutes drive the "ready by" line on the receipt and the over-time flag on the board.'),
      err,
      h('div', { class: 'btnrow', style: 'margin-top:16px' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, 'Save settings'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.rerender() }, 'Discard changes'))),

    h('aside', { class: 'stack' },
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'This demo right now')),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Orders'), h('dd', { class: 'mono' }, num(ctx.state.orders.length)),
          h('dt', {}, 'Today'), h('dd', { class: 'mono' }, `${num(today.orders)} · ${money(today.gross, ctx.currency())}`),
          h('dt', {}, 'Products'), h('dd', { class: 'mono' }, num(ctx.state.products.length)),
          h('dt', {}, 'Low stock'), h('dd', { class: 'mono' }, num(lowStock(ctx.state).length)),
          h('dt', {}, 'Codes'), h('dd', { class: 'mono' }, num(ctx.state.discounts.length)),
          h('dt', {}, 'Storage key'), h('dd', { class: 'mono small' }, STORAGE_KEY))),
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Demo data')),
        h('p', { class: 'small muted' }, 'Everything you do here is written to this browser only. Resetting rebuilds the original seven days of sample orders and puts stock, codes and settings back where they started.'),
        h('div', { class: 'btnrow', style: 'margin-top:14px' },
          h('button', {
            class: 'btn btn--danger', type: 'button', html: `${icon('refresh')}<span>Reset demo data</span>`,
            onclick: async () => {
              const ok = await confirmDialog('This clears every order, product edit and code change you made here.', { title: 'Reset demo data', okLabel: 'Reset', danger: true });
              if (!ok) return;
              ctx.store.reset();
              closeCart();
              ctx.rerender();
              toast('Demo data reset', 'ok');
            },
          }))),
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Keyboard')),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Assistant'), h('dd', {}, h('span', { class: 'kbd' }, '⌘K'), ' or ', h('span', { class: 'kbd' }, 'Ctrl K')),
          h('dt', {}, 'Cart'), h('dd', {}, h('span', { class: 'kbd' }, 'C')),
          h('dt', {}, 'Switch face'), h('dd', {}, h('span', { class: 'kbd' }, 'B')),
          h('dt', {}, 'Sections'), h('dd', {}, h('span', { class: 'kbd' }, '1'), '–', h('span', { class: 'kbd' }, '6')),
          h('dt', {}, 'Search'), h('dd', {}, h('span', { class: 'kbd' }, '/')),
          h('dt', {}, 'Close'), h('dd', {}, h('span', { class: 'kbd' }, 'Esc')))))));

  return wrap;
}

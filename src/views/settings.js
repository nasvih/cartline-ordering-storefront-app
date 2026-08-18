/* Operations — store settings. Everything here changes the other screens. */

import { h, icon, num, money, toast, confirmDialog } from '../../lib/ui.js';
import { STORAGE_KEY, lowStock, dayKey, daySummary } from '../data.js';
import { closeCart } from '../cart.js';
import { t } from '../main.js';

export default function renderSettings(ctx) {
  const wrap = h('div', {});
  const s = ctx.state.settings;

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.settings.title')),
      h('p', {}, t('settings.sub')))));

  const storeName = h('input', { class: 'input', value: s.storeName, 'aria-label': t('settings.storeNameAria') });
  const tagline = h('input', { class: 'input', value: s.tagline, 'aria-label': t('settings.taglineAria') });
  const counterName = h('input', { class: 'input', value: s.counterName, 'aria-label': t('settings.counterAria') });
  const taxPct = h('input', { class: 'input', type: 'number', min: '0', max: '28', value: String(s.taxPct), 'aria-label': t('settings.taxAria') });
  const lowStockAt = h('input', { class: 'input', type: 'number', min: '0', max: '99', value: String(s.lowStockAt), 'aria-label': t('settings.lowAria') });
  const prepMinutes = h('input', { class: 'input', type: 'number', min: '1', max: '120', value: String(s.prepMinutes), 'aria-label': t('settings.prepAria') });
  const accepting = h('input', { type: 'checkbox', checked: s.acceptingOrders });

  const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

  const save = () => {
    const tax = Number(taxPct.value);
    const low = Number(lowStockAt.value);
    const prep = Number(prepMinutes.value);
    if (!storeName.value.trim()) { err.textContent = t('settings.needName'); err.hidden = false; return; }
    if (tax < 0 || tax > 28) { err.textContent = t('settings.badTax'); err.hidden = false; return; }
    if (low < 0 || prep < 1) { err.textContent = t('settings.badThreshold'); err.hidden = false; return; }
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
    toast(t('settings.saved'), 'ok');
    ctx.rerender();
  };

  const today = daySummary(ctx.state, dayKey(new Date()));

  wrap.appendChild(h('div', { class: 'grid g-side' },
    h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('settings.storefront'))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.storeName')), storeName),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.tagline')), tagline),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.counterName')), counterName),
      h('label', { class: 'switch', style: 'margin-top:16px' }, accepting, h('span', { class: 'switch__track' }), h('span', {}, t('settings.accepting'))),
      h('hr', { class: 'hr' }),
      h('h3', { style: 'margin-bottom:12px' }, t('settings.numbers')),
      h('div', { class: 'grid g3', style: 'gap:12px' },
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('settings.taxPct')), taxPct),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('settings.lowAt')), lowStockAt),
        h('label', { class: 'field', style: 'margin-top:0' }, h('span', { class: 'field__label' }, t('settings.prepMins')), prepMinutes)),
      h('p', { class: 'hint' }, t('settings.numbersHint')),
      err,
      h('div', { class: 'btnrow', style: 'margin-top:16px' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, t('settings.save')),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.rerender() }, t('settings.discard')))),

    h('aside', { class: 'stack' },
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('settings.rightNow'))),
        h('dl', { class: 'kv' },
          h('dt', {}, t('settings.kvOrders')), h('dd', { class: 'mono' }, num(ctx.state.orders.length)),
          h('dt', {}, t('settings.kvToday')), h('dd', { class: 'mono' }, `${num(today.orders)} · ${money(today.gross, ctx.currency())}`),
          h('dt', {}, t('settings.kvProducts')), h('dd', { class: 'mono' }, num(ctx.state.products.length)),
          h('dt', {}, t('settings.kvLow')), h('dd', { class: 'mono' }, num(lowStock(ctx.state).length)),
          h('dt', {}, t('settings.kvCodes')), h('dd', { class: 'mono' }, num(ctx.state.discounts.length)),
          h('dt', {}, t('settings.kvKey')), h('dd', { class: 'mono small', dir: 'ltr' }, STORAGE_KEY))),
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('settings.demoData'))),
        h('p', { class: 'small muted' }, t('settings.demoP')),
        h('div', { class: 'btnrow', style: 'margin-top:14px' },
          h('button', {
            class: 'btn btn--danger', type: 'button', html: `${icon('refresh')}<span>${t('reset.title')}</span>`,
            onclick: async () => {
              const ok = await confirmDialog(t('reset.bodyShort'), { title: t('reset.title'), okLabel: t('reset.ok'), danger: true });
              if (!ok) return;
              ctx.store.reset();
              closeCart();
              ctx.rerender();
              toast(t('reset.done'), 'ok');
            },
          }))),
      h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('settings.keyboard'))),
        h('dl', { class: 'kv' },
          h('dt', {}, t('settings.kbAssistant')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, '⌘K'), t('settings.kbOr'), h('span', { class: 'kbd' }, 'Ctrl K')),
          h('dt', {}, t('settings.kbCart')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, 'C')),
          h('dt', {}, t('settings.kbFace')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, 'B')),
          h('dt', {}, t('settings.kbSections')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, '1'), '–', h('span', { class: 'kbd' }, '6')),
          h('dt', {}, t('settings.kbSearch')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, '/')),
          h('dt', {}, t('settings.kbClose')), h('dd', { dir: 'ltr' }, h('span', { class: 'kbd' }, 'Esc')))))));

  return wrap;
}

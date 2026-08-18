/* Checkout — details, a simulated payment step, then a confirmation
   carrying the order number. Placing an order writes a real record
   that shows up on the operations board. */

import { h, icon, money, toast, fmtTime } from '../../lib/ui.js';
import { cartTotals, clearCart, setQty, stepper, totalRow, tile } from '../cart.js';
import { CHANNELS, discountByCode } from '../data.js';
import { t } from '../main.js';
import { tr } from '../strings.js';

const PAYMENTS = ['UPI', 'Card', 'Cash'];

export default function renderCheckout(ctx) {
  const wrap = h('div', {});
  let step = 1;
  let placed = null;
  const form = { customer: '', channel: 'Pickup', area: '', note: '', payment: 'UPI', decline: false };

  const head = h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('route.checkout.title')),
      h('p', {}, t('checkout.sub'))));
  wrap.appendChild(head);

  const stepsEl = h('div', { class: 'steps' });
  const body = h('div', {});
  wrap.appendChild(stepsEl);
  wrap.appendChild(body);

  function paintSteps() {
    stepsEl.innerHTML = '';
    [t('checkout.step1'), t('checkout.step2'), t('checkout.step3')].forEach((label, i) => {
      const n = i + 1;
      stepsEl.appendChild(h('div', {
        class: `steps__item${n === step ? ' is-on' : ''}${n < step ? ' is-done' : ''}`,
        'aria-current': n === step ? 'step' : null,
      }, h('span', { class: 'steps__n' }, n < step ? '✓' : String(n)), label));
    });
  }

  function summaryCard() {
    const { lines, subtotal, discountAmt, tax, total, code } = cartTotals(ctx.state);
    const card = h('aside', { class: 'card' }, h('div', { class: 'card__head' }, h('h3', {}, t('checkout.basket'))));
    if (!lines.length) {
      card.appendChild(h('p', { class: 'muted small' }, t('checkout.basketEmpty')));
      return card;
    }
    lines.forEach((l) => card.appendChild(h('div', { class: 'cartline' },
      tile(l, 'tile--sm'),
      h('div', { class: 'cartline__main' },
        h('div', { class: 'cartline__name' }, l.name),
        step === 1
          ? h('div', { class: 'row', style: 'margin-top:6px' }, stepper(l.qty, (n) => { setQty(ctx.store, l.productId, n); ctx.rerender(); }, l.stock))
          : h('div', { class: 'small muted mono' }, `${l.qty} × ${money(l.price, ctx.currency())}`)),
      h('div', { class: 'mono', style: 'font-weight:600' }, money(l.price * l.qty, ctx.currency())))));
    card.appendChild(h('div', { class: 'totals' },
      totalRow(t('common.subtotal'), money(subtotal, ctx.currency())),
      discountAmt ? totalRow(t('cart.discountRow', { code: code ? code.code : '' }), `− ${money(discountAmt, ctx.currency())}`) : null,
      totalRow(t('cart.taxRow', { pct: ctx.state.settings.taxPct }), money(tax, ctx.currency())),
      h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, t('common.total')), h('strong', {}, money(total, ctx.currency())))));
    return card;
  }

  /* ---------- step 1 ---------- */
  function stepDetails() {
    const { lines } = cartTotals(ctx.state);
    if (!lines.length) {
      return h('div', { class: 'empty' },
        h('h3', {}, t('checkout.emptyH')),
        h('p', {}, t('checkout.emptyP')),
        h('div', { class: 'btnrow', style: 'justify-content:center;margin-top:14px' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => ctx.nav('shop') }, t('checkout.goShop'))));
    }

    const name = h('input', { class: 'input', placeholder: t('checkout.nameField'), 'aria-label': t('checkout.nameField'), value: form.customer });
    const channel = h('select', { class: 'select', 'aria-label': t('checkout.collectAria') },
      ...CHANNELS.map((c) => h('option', { value: c, selected: c === form.channel }, t(`data.channel.${c}`))));
    const area = h('input', { class: 'input', placeholder: t('checkout.area'), 'aria-label': t('checkout.area'), value: form.area });
    const areaField = h('label', { class: 'field', hidden: form.channel !== 'Delivery' },
      h('span', { class: 'field__label' }, t('checkout.area')), area);
    channel.addEventListener('change', () => {
      form.channel = channel.value;
      areaField.hidden = form.channel !== 'Delivery';
    });
    const note = h('textarea', { class: 'textarea', placeholder: t('checkout.noteField'), 'aria-label': t('checkout.noteAria') }, form.note);

    const codeInput = h('input', { class: 'input', placeholder: t('cart.code'), 'aria-label': t('cart.code'), value: ctx.state.cart.code || '' });

    const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

    const left = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('checkout.step1'))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.customer')), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.collection')), channel),
      areaField,
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('common.note')), note),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('cart.code')),
        h('div', { class: 'codebox', style: 'margin-top:0' }, codeInput,
          h('button', {
            class: 'btn', type: 'button',
            onclick: () => {
              const raw = codeInput.value.trim().toUpperCase();
              if (!raw) { ctx.store.update((s) => { s.cart.code = ''; }); ctx.rerender(); return; }
              const d = discountByCode(ctx.state, raw);
              const { subtotal } = cartTotals(ctx.state);
              if (!d || !d.active) { toast(t('cart.notActive'), 'bad'); return; }
              if (subtotal < d.minOrder) { toast(t('checkout.needsBasket', { code: raw, money: money(d.minOrder, ctx.currency()) }), 'bad'); return; }
              ctx.store.update((s) => { s.cart.code = raw; });
              toast(t('cart.applied', { code: raw }), 'ok');
              ctx.rerender();
            },
          }, t('cart.apply')))),
      err,
      h('div', { class: 'btnrow', style: 'margin-top:16px' },
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => {
            form.customer = name.value.trim();
            form.channel = channel.value;
            form.area = area.value.trim();
            form.note = note.value.trim();
            if (!form.customer) { err.textContent = t('checkout.needName'); err.hidden = false; name.focus(); return; }
            if (form.channel === 'Delivery' && !form.area) { err.textContent = t('checkout.needArea'); err.hidden = false; area.focus(); return; }
            if (!ctx.state.settings.acceptingOrders) { err.textContent = t('checkout.storeOff'); err.hidden = false; return; }
            err.hidden = true;
            step = 2;
            paint();
          },
        }, t('checkout.continue')),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.nav('shop') }, t('checkout.keepShopping'))));

    return h('div', { class: 'grid g-side' }, left, summaryCard());
  }

  /* ---------- step 2 ---------- */
  function stepPayment() {
    const { total } = cartTotals(ctx.state);
    const opts = h('div', { class: 'payopts' });
    PAYMENTS.forEach((p) => {
      opts.appendChild(h('button', {
        class: `payopt${p === form.payment ? ' is-on' : ''}`, type: 'button',
        'aria-pressed': String(p === form.payment),
        onclick: () => { form.payment = p; paint(); },
      },
      h('span', { class: 'payopt__k' }, t(`data.payment.${p}`)),
      h('span', { class: 'small muted', style: 'display:block;margin-top:4px' }, t(`data.paymentNote.${p}`))));
    });

    const state = h('div', { class: 'paystate', hidden: true });
    const payBtn = h('button', { class: 'btn btn--primary', type: 'button' },
      t('checkout.pay', { money: money(total, ctx.currency()) }));

    const decline = h('input', { type: 'checkbox', checked: form.decline });
    decline.addEventListener('change', () => { form.decline = decline.checked; });

    payBtn.addEventListener('click', () => {
      payBtn.disabled = true;
      state.hidden = false;
      state.innerHTML = '';
      const bar = h('div', { class: 'meter' });
      const fill = h('div', { class: 'meter__fill', style: 'width:4%' });
      bar.appendChild(fill);
      const lineEl = h('p', { class: 'small muted', style: 'margin-bottom:8px' },
        t('checkout.authorising', { money: money(total, ctx.currency()), method: t(`data.payment.${form.payment}`) }));
      state.appendChild(lineEl);
      state.appendChild(bar);
      let pctDone = 4;
      const timer = setInterval(() => {
        pctDone = Math.min(100, pctDone + 12);
        fill.style.width = `${pctDone}%`;
        if (pctDone >= 100) {
          clearInterval(timer);
          if (form.decline) {
            fill.classList.add('meter__fill--bad');
            lineEl.textContent = t('checkout.declined');
            state.appendChild(h('p', { class: 'small', style: 'margin-top:10px;color:var(--bad)' },
              t('checkout.declinedRef')));
            payBtn.disabled = false;
            return;
          }
          fill.classList.add('meter__fill--ok');
          lineEl.textContent = t('checkout.approved');
          placed = placeOrder(ctx, form);
          step = 3;
          setTimeout(paint, 420);
        }
      }, 110);
    });

    const left = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('common.payment'))),
      h('div', { class: 'banner', style: 'margin-bottom:14px' },
        h('span', { html: icon('alert') }),
        h('div', {}, t('checkout.simBanner'))),
      opts,
      h('label', { class: 'switch', style: 'margin-top:14px' }, decline, h('span', { class: 'switch__track' }), h('span', {}, t('checkout.simDecline'))),
      h('div', { class: 'btnrow', style: 'margin-top:16px' }, payBtn,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { step = 1; paint(); } }, t('common.back'))),
      h('div', { style: 'margin-top:14px' }, state));

    return h('div', { class: 'grid g-side' }, left, summaryCard());
  }

  /* ---------- step 3 ---------- */
  function stepDone() {
    const o = placed;
    if (!o) { step = 1; return stepDetails(); }
    const ready = new Date(new Date(o.placedAt).getTime() + ctx.state.settings.prepMinutes * 60000);
    return h('div', { class: 'grid g-side' },
      h('div', { class: 'receipt' },
        h('div', { class: 'row', style: 'gap:12px' },
          h('span', { class: 'bigcheck', html: icon('check') }),
          h('div', {}, h('h2', {}, t('checkout.placedH')), h('p', { class: 'small muted' },
            t('checkout.paidBy', { payment: t(`data.payment.${o.payment}`), channel: t(`data.channel.${o.channel}`) })))),
        h('p', { class: 'label', style: 'margin-top:18px' }, t('checkout.orderNumber')),
        h('p', { class: 'receipt__no', dir: 'ltr' }, o.no),
        h('dl', { class: 'kv', style: 'margin-top:16px' },
          h('dt', {}, t('common.name')), h('dd', {}, o.customer),
          h('dt', {}, t('common.items')), h('dd', {}, t('checkout.linesOf', { items: o.items.reduce((s, it) => s + it.qty, 0), lines: o.items.length })),
          h('dt', {}, t('checkout.paid')), h('dd', { class: 'mono' }, money(o.total, ctx.currency())),
          h('dt', {}, t('checkout.readyBy')), h('dd', {}, t('checkout.readyAt', { time: fmtTime(ready), mins: ctx.state.settings.prepMinutes })),
          o.area ? h('dt', {}, t('checkout.areaLabel')) : null, o.area ? h('dd', {}, tr('area', o.area)) : null),
        h('div', { class: 'btnrow', style: 'margin-top:20px' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => ctx.nav(`track?no=${o.no}`) }, t('checkout.trackThis')),
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.nav('board') }, t('checkout.seeOnBoard')),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.nav('shop') }, t('checkout.backToShop')))),
      h('aside', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('checkout.whatH'))),
        h('ul', { class: 'stack small muted' },
          h('li', {}, t('checkout.what1', { no: o.no })),
          h('li', {}, t('checkout.what2')),
          h('li', {}, o.discountCode ? t('checkout.what3', { code: o.discountCode }) : t('checkout.what3none')),
          h('li', {}, t('checkout.what4')),
          h('li', {}, t('checkout.what5')))));
  }

  function paint() {
    paintSteps();
    body.innerHTML = '';
    body.appendChild(step === 1 ? stepDetails() : step === 2 ? stepPayment() : stepDone());
    ctx.syncChrome();
  }

  paint();
  return wrap;
}

/* ---------- write the order ---------- */

export function placeOrder(ctx, form) {
  const { lines, subtotal, discountAmt, tax, total, code } = cartTotals(ctx.state);
  const now = new Date().toISOString();
  let created = null;
  ctx.store.update((s) => {
    const no = s.counter + 1;
    const order = {
      id: `O${no}`,
      no: `CL-${no}`,
      customer: form.customer,
      channel: form.channel,
      area: form.area || '',
      note: form.note || '',
      items: lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty, category: l.category })),
      subtotal,
      discountAmt,
      discountCode: discountAmt > 0 && code ? code.code : '',
      tax,
      delivery: 0,
      total,
      payment: form.payment,
      status: 'new',
      placedAt: now,
      updatedAt: now,
      handledBy: 'Storefront',
      refund: null,
      timeline: [{ at: now, label: 'Order placed', by: 'Storefront' }],
    };
    order.items.forEach((it) => {
      const p = s.products.find((x) => x.id === it.productId);
      if (p) p.stock = Math.max(0, p.stock - it.qty);
    });
    if (order.discountCode) {
      const d = s.discounts.find((x) => x.code === order.discountCode);
      if (d) d.uses += 1;
    }
    s.orders.unshift(order);
    s.counter = no;
    s.lastOrderNo = order.no;
    s.cart = { items: [], code: '' };
    created = order;
  });
  clearCart(ctx.store);
  toast(t('checkout.orderPlaced', { no: created.no }), 'ok');
  return created;
}

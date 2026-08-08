/* Checkout — details, a simulated payment step, then a confirmation
   carrying the order number. Placing an order writes a real record
   that shows up on the operations board. */

import { h, icon, money, toast, fmtTime } from '../../lib/ui.js';
import { cartTotals, clearCart, setQty, stepper, totalRow, tile } from '../cart.js';
import { CHANNELS, discountByCode } from '../data.js';

const PAYMENTS = [
  { id: 'UPI', k: 'UPI', note: 'Approve in the payments app' },
  { id: 'Card', k: 'Card', note: 'Saved card ending 4417' },
  { id: 'Cash', k: 'Cash', note: 'Pay at the counter on pickup' },
];

export default function renderCheckout(ctx) {
  const wrap = h('div', {});
  let step = 1;
  let placed = null;
  const form = { customer: '', channel: 'Pickup', area: '', note: '', payment: 'UPI', decline: false };

  const head = h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Checkout'),
      h('p', {}, 'Three steps: who the order is for, a simulated payment, then the confirmation. No money moves and nothing leaves the browser.')));
  wrap.appendChild(head);

  const stepsEl = h('div', { class: 'steps' });
  const body = h('div', {});
  wrap.appendChild(stepsEl);
  wrap.appendChild(body);

  function paintSteps() {
    stepsEl.innerHTML = '';
    ['Order details', 'Payment', 'Confirmation'].forEach((label, i) => {
      const n = i + 1;
      stepsEl.appendChild(h('div', {
        class: `steps__item${n === step ? ' is-on' : ''}${n < step ? ' is-done' : ''}`,
        'aria-current': n === step ? 'step' : null,
      }, h('span', { class: 'steps__n' }, n < step ? '✓' : String(n)), label));
    });
  }

  function summaryCard() {
    const { lines, subtotal, discountAmt, tax, total, code } = cartTotals(ctx.state);
    const card = h('aside', { class: 'card' }, h('div', { class: 'card__head' }, h('h3', {}, 'Basket')));
    if (!lines.length) {
      card.appendChild(h('p', { class: 'muted small' }, 'The basket is empty.'));
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
      totalRow('Subtotal', money(subtotal, ctx.currency())),
      discountAmt ? totalRow(`Discount ${code ? code.code : ''}`, `− ${money(discountAmt, ctx.currency())}`) : null,
      totalRow(`Tax ${ctx.state.settings.taxPct}%`, money(tax, ctx.currency())),
      h('div', { class: 'totals__row totals__row--grand' }, h('span', {}, 'Total'), h('strong', {}, money(total, ctx.currency())))));
    return card;
  }

  /* ---------- step 1 ---------- */
  function stepDetails() {
    const { lines } = cartTotals(ctx.state);
    if (!lines.length) {
      return h('div', { class: 'empty' },
        h('h3', {}, 'Your cart is empty'),
        h('p', {}, 'Pick something from the shop first — checkout needs at least one line.'),
        h('div', { class: 'btnrow', style: 'justify-content:center;margin-top:14px' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => ctx.nav('shop') }, 'Go to the shop')));
    }

    const name = h('input', { class: 'input', placeholder: 'Name for the order', 'aria-label': 'Name for the order', value: form.customer });
    const channel = h('select', { class: 'select', 'aria-label': 'How the order is collected' },
      ...CHANNELS.map((c) => h('option', { value: c, selected: c === form.channel }, c)));
    const area = h('input', { class: 'input', placeholder: 'Delivery area', 'aria-label': 'Delivery area', value: form.area });
    const areaField = h('label', { class: 'field', hidden: form.channel !== 'Delivery' },
      h('span', { class: 'field__label' }, 'Delivery area'), area);
    channel.addEventListener('change', () => {
      form.channel = channel.value;
      areaField.hidden = form.channel !== 'Delivery';
    });
    const note = h('textarea', { class: 'textarea', placeholder: 'Anything the kitchen should know', 'aria-label': 'Order note' }, form.note);

    const codeInput = h('input', { class: 'input', placeholder: 'Discount code', 'aria-label': 'Discount code', value: ctx.state.cart.code || '' });

    const err = h('p', { class: 'hint', style: 'color:var(--bad)', hidden: true });

    const left = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Order details')),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Customer'), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Collection'), channel),
      areaField,
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Note'), note),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Discount code'),
        h('div', { class: 'codebox', style: 'margin-top:0' }, codeInput,
          h('button', {
            class: 'btn', type: 'button',
            onclick: () => {
              const raw = codeInput.value.trim().toUpperCase();
              if (!raw) { ctx.store.update((s) => { s.cart.code = ''; }); ctx.rerender(); return; }
              const d = discountByCode(ctx.state, raw);
              const { subtotal } = cartTotals(ctx.state);
              if (!d || !d.active) { toast('That code is not active', 'bad'); return; }
              if (subtotal < d.minOrder) { toast(`${raw} needs ${money(d.minOrder, ctx.currency())} or more in the basket`, 'bad'); return; }
              ctx.store.update((s) => { s.cart.code = raw; });
              toast(`${raw} applied`, 'ok');
              ctx.rerender();
            },
          }, 'Apply'))),
      err,
      h('div', { class: 'btnrow', style: 'margin-top:16px' },
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => {
            form.customer = name.value.trim();
            form.channel = channel.value;
            form.area = area.value.trim();
            form.note = note.value.trim();
            if (!form.customer) { err.textContent = 'Add a name so the counter can call the order.'; err.hidden = false; name.focus(); return; }
            if (form.channel === 'Delivery' && !form.area) { err.textContent = 'Delivery needs an area.'; err.hidden = false; area.focus(); return; }
            if (!ctx.state.settings.acceptingOrders) { err.textContent = 'The store is switched off in Store settings.'; err.hidden = false; return; }
            err.hidden = true;
            step = 2;
            paint();
          },
        }, 'Continue to payment'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.nav('shop') }, 'Keep shopping')));

    return h('div', { class: 'grid g-side' }, left, summaryCard());
  }

  /* ---------- step 2 ---------- */
  function stepPayment() {
    const { total } = cartTotals(ctx.state);
    const opts = h('div', { class: 'payopts' });
    PAYMENTS.forEach((p) => {
      opts.appendChild(h('button', {
        class: `payopt${p.id === form.payment ? ' is-on' : ''}`, type: 'button',
        'aria-pressed': String(p.id === form.payment),
        onclick: () => { form.payment = p.id; paint(); },
      },
      h('span', { class: 'payopt__k' }, p.k),
      h('span', { class: 'small muted', style: 'display:block;margin-top:4px' }, p.note)));
    });

    const state = h('div', { class: 'paystate', hidden: true });
    const payBtn = h('button', { class: 'btn btn--primary', type: 'button' },
      `Pay ${money(total, ctx.currency())}`);

    const decline = h('input', { type: 'checkbox', checked: form.decline });
    decline.addEventListener('change', () => { form.decline = decline.checked; });

    payBtn.addEventListener('click', () => {
      payBtn.disabled = true;
      state.hidden = false;
      state.innerHTML = '';
      const bar = h('div', { class: 'meter' });
      const fill = h('div', { class: 'meter__fill', style: 'width:4%' });
      bar.appendChild(fill);
      const lineEl = h('p', { class: 'small muted', style: 'margin-bottom:8px' }, `Authorising ${money(total, ctx.currency())} over ${form.payment}…`);
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
            lineEl.textContent = 'The simulated gateway declined this attempt.';
            state.appendChild(h('p', { class: 'small', style: 'margin-top:10px;color:var(--bad)' },
              'Reference CL-DECLINE-51. Uncheck the decline switch or pick another method and try again.'));
            payBtn.disabled = false;
            return;
          }
          fill.classList.add('meter__fill--ok');
          lineEl.textContent = 'Payment approved.';
          placed = placeOrder(ctx, form);
          step = 3;
          setTimeout(paint, 420);
        }
      }, 110);
    });

    const left = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Payment')),
      h('div', { class: 'banner', style: 'margin-bottom:14px' },
        h('span', { html: icon('alert') }),
        h('div', {}, 'This payment step is simulated. No card is charged, no money moves and nothing leaves your browser — the authorisation below is a timed animation so the flow reads like the real thing.')),
      opts,
      h('label', { class: 'switch', style: 'margin-top:14px' }, decline, h('span', { class: 'switch__track' }), h('span', {}, 'Simulate a declined payment')),
      h('div', { class: 'btnrow', style: 'margin-top:16px' }, payBtn,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { step = 1; paint(); } }, 'Back')),
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
          h('div', {}, h('h2', {}, 'Order placed'), h('p', { class: 'small muted' }, `Paid by ${o.payment} · ${o.channel}`))),
        h('p', { class: 'label', style: 'margin-top:18px' }, 'Order number'),
        h('p', { class: 'receipt__no' }, o.no),
        h('dl', { class: 'kv', style: 'margin-top:16px' },
          h('dt', {}, 'Name'), h('dd', {}, o.customer),
          h('dt', {}, 'Items'), h('dd', {}, `${o.items.reduce((s, it) => s + it.qty, 0)} across ${o.items.length} ${o.items.length === 1 ? 'line' : 'lines'}`),
          h('dt', {}, 'Paid'), h('dd', { class: 'mono' }, money(o.total, ctx.currency())),
          h('dt', {}, 'Ready by'), h('dd', {}, `${fmtTime(ready)} (about ${ctx.state.settings.prepMinutes} minutes)`),
          o.area ? h('dt', {}, 'Area') : null, o.area ? h('dd', {}, o.area) : null),
        h('div', { class: 'btnrow', style: 'margin-top:20px' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => ctx.nav(`track?no=${o.no}`) }, 'Track this order'),
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.nav('board') }, 'See it on the ops board'),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.nav('shop') }, 'Back to the shop'))),
      h('aside', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'What just happened')),
        h('ul', { class: 'stack small muted' },
          h('li', {}, `Order ${o.no} was written to the store with status "new".`),
          h('li', {}, 'Stock came down on every line you bought.'),
          h('li', {}, o.discountCode ? `Discount ${o.discountCode} counted one more use.` : 'No discount code was applied.'),
          h('li', {}, 'Today\'s revenue and average order value on the day summary moved.'),
          h('li', {}, 'The assistant can answer on this order by its number.'))));
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
  toast(`Order ${created.no} placed`, 'ok');
  return created;
}

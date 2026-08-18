/* ============================================================
   Cartline Assist — the things the agent can actually do.

   Every intent in this file reads the sentence, finds the exact record
   it would change and shows what the change looks like *before* it
   happens. Nothing is written until the reader presses the button:
   answer() only reads the store, run() is the only thing that writes.

   Contract with lib/assistant.js:
     answer() -> { text, table?, meta?, suggestions?, actions? }
     actions  -> [{ label, doingLabel?, run() }]
     run()    -> { text, table?, meta?, suggestions?, actions? }  (appended)
   ============================================================ */

import { money, num, toast, ago, fmtDate } from '../lib/ui.js';
import {
  CATEGORIES, REFUND_REASONS, STATUSES, dayKey, orderByNo, discountByCode,
} from './data.js';
import { t } from './main.js';
import { tr, catName } from './strings.js';

/* ---------- small language helpers ---------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const COUNT_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n) => (n < COUNT_WORD.length ? COUNT_WORD[n] : String(n));
const titleCase = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

const STAGE_WORD = {
  new: 'new', preparing: 'preparing', prep: 'preparing', ready: 'ready',
  complete: 'completed', completed: 'completed', done: 'completed', 'handed over': 'completed',
};
function cleanTerm(t) {
  return String(t || '')
    .replace(/^(?:please\s+|can you\s+|could you\s+|kindly\s+)/i, '')
    .replace(/^(?:the|a|an|some|more|our|my)\s+/i, '')
    .replace(/['’]s$/i, '')
    .replace(/\s+(?:please|now|today)$/i, '')
    .replace(/[?.!,]+$/, '')
    .trim();
}

/* Which product the reader means. An exact name or SKU wins outright;
   otherwise every product carrying those words comes back. "Coffee" returning
   two rows is the point — ambiguity is refused, never resolved by guessing
   that the first match was the one they had in mind. */
function matchProducts(state, term) {
  const t = norm(term);
  if (!t) return [];
  const all = state.products;
  const byExact = all.filter((p) => norm(p.name) === t || norm(p.sku) === t);
  if (byExact.length) return byExact;
  const byPart = all.filter((p) => norm(p.name).includes(t));
  if (byPart.length) return byPart;
  const words = t.split(' ').filter((w) => w.length > 2);
  if (!words.length) return [];
  return all.filter((p) => words.every((w) => norm(p.name).includes(w)));
}

function noProduct(state, term) {
  const words = norm(term).split(' ').filter((w) => w.length > 2);
  const near = state.products.filter((p) => words.some((w) => norm(p.name).includes(w.slice(0, 4)))).slice(0, 3);
  return {
    text: t('acts.noProduct', {
      term,
      near: near.length
        ? t('acts.didYouMean', { names: near.map((p) => `**${p.name}**`).join(', ') })
        : t('acts.noNear', { n: num(state.products.length) }),
    }),
    meta: t('acts.noProductMeta', { n: num(state.products.length) }),
    suggestions: [t('ask.lowStock'), t('ask.whatCanYouDo')],
  };
}

/* One refusal shape for every product action: name the clash, list it, and
   offer the exact records as buttons so the next press is unambiguous. */
function ambiguousProduct(list, term, label, run) {
  return {
    text: t('acts.ambiguous', { count: titleCase(countWord(list.length)), n: list.length, term }),
    table: {
      head: [t('common.product'), t('common.sku'), t('common.stock'), t('common.price')],
      rows: list.slice(0, 6).map((p) => [p.name, p.sku, String(p.stock), String(p.price)]),
    },
    meta: t('acts.ambiguousMeta', { n: num(list.length), term }),
    actions: list.slice(0, 4).map((p) => ({ label: label(p), doingLabel: t('acts.applying'), run: () => run(p) })),
  };
}

function orderRef(q) {
  const m = q.match(/\bcl[\s-]?(\d{3,})/i) || q.match(/\border\s*#?\s*(\d{3,})/i) || q.match(/\b(\d{3,})\b/);
  return m ? m[1] : null;
}

/* The change is only real once it is on the screen that owns it. */
function reveal(ctx, route) {
  if (ctx.route === route) ctx.rerender();
  else ctx.nav(route);
  ctx.syncChrome();
}

/* ---------- sentence parsers ---------- */

const RESTOCK_VERB = /^(?:please\s+|can you\s+|could you\s+|i want to\s+|kindly\s+)?(?:restock|re-stock|top\s*up|stock\s*up|add\s+stock\s+(?:to|for|on)|add|bring\s+in|order\s+in|receive|book\s+in)\s+/i;

function parseRestock(q) {
  const s = q.trim().replace(/[?.!]+$/, '');
  let term = s;
  let qty = null;
  let m = s.match(/^(.*?)\s+(?:by|with|plus|\+)\s+(\d+)\s*(?:units?|pcs?|pieces?|packs?)?$/i);
  if (m) { [, term] = m; qty = Number(m[2]); } else {
    m = s.match(/\b(\d+)\s*(?:units?|pcs?|pieces?|packs?)?\s+(?:of|to|into|onto)\s+(.+)$/i);
    if (m) { qty = Number(m[1]); [, , term] = m; } else {
      m = s.match(/^(.*?)\s+(\d+)\s*(?:units?|pcs?|pieces?|packs?)?$/i);
      if (m) { [, term] = m; qty = Number(m[2]); }
    }
  }
  term = cleanTerm(String(term).replace(RESTOCK_VERB, '').replace(/\s+(?:stock|units?|inventory)$/i, ''));
  return { term, qty: qty && qty > 0 ? Math.min(qty, 9999) : null };
}

function parsePrice(q) {
  const s = q.trim().replace(/[?.!]+$/, '');
  const m = s.match(/price\s+(?:of|for|on)\s+(.+?)\s+(?:to|at|=)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i)
    || s.match(/(?:change|set|update|make|move|put|drop|raise|reduce|increase)\s+(.+?)(?:['’]s)?\s+price\s+(?:to|at|=)?\s*(?:₹|rs\.?|inr)?\s*(\d+)/i)
    || s.match(/(?:change|set|update|make|price)\s+(.+?)\s+(?:to|at)\s*(?:₹|rs\.?|inr)\s*(\d+)/i)
    || s.match(/^(?:price)\s+(.+?)\s+(?:to|at)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i);
  if (!m) return null;
  const term = cleanTerm(String(m[1]).replace(/^(?:the\s+)?price\s+(?:of|for|on)\s+/i, '').replace(/\s+price$/i, ''));
  return { term, price: Number(m[2]) };
}

function parseStage(q) {
  const ref = orderRef(q);
  const to = (q.match(/\b(?:to|into|as|at)\s+(new|preparing|prep|ready|completed?|done|handed over)\b/i) || [])[1];
  const forward = /\b(advance|next stage|next step|move (?:it )?(?:on|along|forward)|push (?:it )?(?:on|along)|progress|bump)\b/i.test(q);
  return { ref, stage: to ? STAGE_WORD[to.toLowerCase()] : null, forward };
}

function parseRefund(q) {
  const ref = orderRef(q);
  /* the order number carries a hyphen of its own, so take it out of the
     sentence before looking for the punctuation that introduces a reason */
  const rest = q.replace(/\bcl[\s-]?\d{3,}\b/gi, ' ').replace(/\border\s*#?\s*\d{3,}\b/gi, ' ');
  const m = rest.match(/(?:because|reason|due to|for being|as it was|as they were|—|,|:|\s-\s)\s*(.+)$/i);
  let reason = m ? cleanTerm(m[1]) : '';
  if (/^(please|now|today|thanks)$/i.test(reason)) reason = '';
  if (reason) {
    const known = REFUND_REASONS.find((r) => norm(r).includes(norm(reason)) || norm(reason).includes(norm(r).slice(0, 18)));
    if (known) reason = known;
    else reason = titleCase(reason);
  }
  return { ref, reason };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/* "until Friday" means the next Friday from today, which is the only reading
   a shop would use. Anything we cannot date is kept as the reader's words. */
function readDeadline(raw) {
  const t = norm(raw);
  if (!t) return null;
  const fmt = (d) => fmtDate(d, { weekday: 'long', day: '2-digit', month: 'short' });
  if (t === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); return fmt(d); }
  if (t === 'today' || t === 'tonight') return fmt(new Date());
  const wd = WEEKDAYS.findIndex((w) => t.startsWith(w));
  if (wd >= 0) {
    const d = new Date();
    const delta = ((wd - d.getDay()) + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return fmt(d);
  }
  if (/^(the )?end of (the )?(month|week)$/.test(t)) return `the ${t.replace(/^the /, '')}`;
  return titleCase(raw.trim());
}

function parseDiscount(q) {
  const pctM = q.match(/(\d{1,2})\s*(?:%|percent|per cent)/i);
  const flatM = q.match(/(?:₹|rs\.?|inr)\s*(\d+)\s*(?:off|discount)/i) || q.match(/\b(\d{2,4})\s*(?:rupees|rs)\s*off/i);
  const codeM = q.match(/\bcode(?:d|\s+is|\s+name[d]?)?\s*[:\-]?\s*([A-Za-z][A-Za-z0-9]{2,15})\b/i)
    || q.match(/\bcall(?:ed|\s+it)\s+([A-Za-z][A-Za-z0-9]{2,15})\b/i)
    || q.match(/\b([A-Z][A-Z0-9]{3,15})\b/);
  const minM = q.match(/\b(?:over|above|minimum|min\.?|baskets? of|orders? of)\s*(?:₹|rs\.?)?\s*(\d+)/i);
  const untilM = q.match(/\b(?:until|till|thru|through|up to|ends?(?:\s+on)?|expires?(?:\s+on)?|valid\s+(?:until|till))\s+([a-z0-9 ]+?)(?:[,.]|$)/i);
  const cat = CATEGORIES.find((c) => new RegExp(`\\b${c.name}\\b`, 'i').test(q));
  return {
    kind: pctM ? 'pct' : (flatM ? 'flat' : null),
    value: pctM ? Number(pctM[1]) : (flatM ? Number(flatM[1] || flatM[2]) : null),
    code: codeM ? codeM[1].toUpperCase() : null,
    minOrder: minM ? Number(minM[1]) : 0,
    scope: cat ? cat.name : '',
    scopeId: cat ? cat.id : '',
    until: untilM ? readDeadline(untilM[1]) : null,
  };
}

/* The two states, in the words each language uses for them. The Arabic
   alternatives carry Arabic letters, so they can never fire on English input;
   the English ones are untouched. Everything downstream is language-blind —
   `norm()` reduces the sentence to its Latin run, which is the product name. */
const OUT_AR = /(نافد|نفد|غير\s*متاح|غير\s*متوفر|خارج\s+المخزون|من\s+القائمة)/;
const BACK_AR = /(إلى\s+المخزون|الى\s+المخزون|متاح\s+(?:مجدد|مرة)|للبيع|عاد\s+للبيع)/;

function parseAvailability(q) {
  const out = /\b(out of stock|sold out|unavailable|not available|off the menu|off sale)\b/i.test(q) || OUT_AR.test(q);
  const back = /\b(back in stock|in stock again|available again|back on (?:the )?(?:menu|sale)|back on)\b/i.test(q) || BACK_AR.test(q);
  const qtyM = q.match(/\b(?:with|at|to)\s+(\d+)\b/i) || q.match(/\b(\d+)\s*(?:units?|pcs?|pieces?)\b/i)
    || q.match(/(?:بـ|بمقدار|ب)\s*(\d+)/);
  const term = cleanTerm(q
    .replace(/^(?:please\s+|can you\s+|could you\s+)?(?:mark|set|flag|make|put|show|list|take)\s+/i, '')
    .replace(/\s*\b(?:as|to|back)?\s*(?:out of stock|sold out|unavailable|not available|off the menu|off sale|back in stock|in stock again|available again|back on (?:the )?(?:menu|sale)|back on)\b.*$/i, '')
    .replace(/\s+(?:with|at|to)\s+\d+.*$/i, ''));
  return { out: out && !back, back, term, qty: qtyM ? Number(qtyM[1]) : null };
}

/* ============================================================
   The action intents
   ============================================================ */

export function actionIntents(ctx) {
  const cur = () => ctx.state.settings.currency;
  const M = (n) => money(n, cur());

  /* ---------- 1. restock ---------- */

  function runRestock(p, qty) {
    const before = p.stock;
    ctx.store.update((s) => {
      const t = s.products.find((x) => x.id === p.id);
      if (t) t.stock = Math.max(0, t.stock + qty);
    });
    const after = (ctx.state.products.find((x) => x.id === p.id) || {}).stock;
    toast(t('acts.restockToast', { name: p.name, n: after }), 'ok');
    reveal(ctx, 'products');
    const limit = ctx.state.settings.lowStockAt;
    return {
      text: t('acts.restockDone', {
        name: p.name,
        sku: p.sku,
        before: num(before),
        after: num(after),
        off: after > limit && before <= limit ? t('acts.restockOff') : '',
      }),
      table: {
        head: [t('common.field'), t('common.before'), t('common.after')],
        rows: [
          [t('common.stock'), String(before), `**${after}**`],
          [t('common.state'),
            before <= limit ? (before === 0 ? t('acts.outOfStock') : t('acts.lowStock')) : t('acts.listed'),
            after <= limit ? (after === 0 ? t('acts.outOfStock') : t('acts.lowStock')) : t('acts.listed')],
          [t('acts.stockAtCost'), M(before * p.cost), M(after * p.cost)],
        ],
      },
      meta: t('acts.wroteProduct', { sku: p.sku }),
      suggestions: [t('ask.lowStock'), t('ask.stockValue'), t('ask.whatCanYouDo')],
    };
  }

  const restock = {
    id: 'act-restock',
    /* Two regexes, both needed for a confident match: the verb, and the verb
       with something after it. "What should I restock?" scores once and gets a
       nudge; "restock Karak Chai by 24" scores twice and beats every reader. */
    match: [
      /\b(restock|re-stock|top\s*up|stock\s*up|book in)\b/i,
      /\b(?:restock|re-stock|top\s*up|stock\s*up|add|bring in|order in|receive)\s+(?:\d+\s+(?:units?\s+)?(?:of|to)\s+)?(?:the\s+)?[a-z][a-z0-9]{2,}/i,
    ],
    trace: t('acts.restockTrace'),
    answer: (q) => {
      const { term, qty } = parseRestock(q);
      if (!term) return { text: t('acts.restockAsk'), suggestions: [t('ask.lowStock'), t('ask.whatCanYouDo')] };
      const hits = matchProducts(ctx.state, term);
      if (!hits.length) return noProduct(ctx.state, term);
      const amount = qty || 20;
      if (hits.length > 1) {
        return ambiguousProduct(hits, term, (p) => t('acts.restockChip', { name: p.name, n: amount }), (p) => runRestock(p, amount));
      }
      const p = hits[0];
      return {
        text: t('acts.restockPreview', {
          name: p.name,
          sku: p.sku,
          stock: num(p.stock),
          add: num(amount),
          after: num(p.stock + amount),
          tail: qty ? '' : t('acts.restockDefaultTail'),
        }),
        table: {
          head: [t('common.field'), t('common.now'), t('common.after')],
          rows: [[t('common.stock'), String(p.stock), String(p.stock + amount)], [t('reads.atCostRow'), M(p.stock * p.cost), M((p.stock + amount) * p.cost)]],
        },
        meta: t('acts.readProduct', { sku: p.sku }),
        actions: [{ label: t('acts.restockLabel', { name: p.name, n: amount }), doingLabel: t('acts.restocking'), run: () => runRestock(p, amount) }],
      };
    },
  };

  /* ---------- 2. price ---------- */

  function runPrice(p, price) {
    const before = p.price;
    ctx.store.update((s) => {
      const t = s.products.find((x) => x.id === p.id);
      if (t) t.price = price;
    });
    toast(t('acts.priceToast', { name: p.name, price: M(price) }), 'ok');
    reveal(ctx, 'products');
    const margin = (v) => `${Math.round(((v - p.cost) / v) * 100)}%`;
    return {
      text: t('acts.priceDone', {
        name: p.name,
        price: M(price),
        dir: price >= before ? t('acts.priceUp') : t('acts.priceDown'),
        before: M(before),
      }),
      table: {
        head: [t('common.field'), t('common.before'), t('common.after')],
        rows: [[t('common.price'), M(before), `**${M(price)}**`], [t('common.cost'), M(p.cost), M(p.cost)], [t('common.margin'), margin(before), margin(price)]],
      },
      meta: t('acts.wroteProduct', { sku: p.sku }),
      suggestions: [t('ask.bestSellers'), t('ask.category'), t('ask.whatCanYouDo')],
    };
  }

  const price = {
    id: 'act-price',
    match: [/\bprice\b/i, /\b(change|set|update|make|drop|raise|reduce|increase)\b/i, /\b(?:to|at)\s*(?:₹|rs\.?|inr)?\s*\d+/i],
    trace: t('acts.priceTrace'),
    answer: (q) => {
      const parsed = parsePrice(q);
      if (!parsed) {
        /* "What is the price of Filter Coffee?" is a question, not an
           instruction — answer it rather than asking them to rephrase. */
        const askM = q.match(/price\s+(?:of|for|on)\s+(.+?)\s*[?.!]*$/i);
        const asked = askM ? matchProducts(ctx.state, cleanTerm(askM[1])) : [];
        if (asked.length === 1) {
          const p = asked[0];
          return {
            text: t('acts.priceQuestion', {
              name: p.name,
              sku: p.sku,
              price: M(p.price),
              cost: M(p.cost),
              margin: Math.round(((p.price - p.cost) / p.price) * 100),
              stock: num(p.stock),
              next: p.price + 5,
            }),
            meta: t('acts.readProduct', { sku: p.sku }),
            suggestions: [t('ask.bestSellers'), t('ask.lowStock'), t('ask.whatCanYouDo')],
          };
        }
        return {
          text: t('acts.priceAsk'),
          suggestions: [t('ask.whatCanYouDo'), t('ask.bestSellers')],
        };
      }
      const hits = matchProducts(ctx.state, parsed.term);
      if (!hits.length) return noProduct(ctx.state, parsed.term);
      if (hits.length > 1) {
        return ambiguousProduct(hits, parsed.term, (p) => t('acts.priceChip', { name: p.name, price: M(parsed.price) }), (p) => runPrice(p, parsed.price));
      }
      const p = hits[0];
      if (parsed.price <= p.cost) {
        return {
          text: t('acts.priceBelowCost', { name: p.name, price: M(parsed.price), cost: M(p.cost) }),
          meta: t('acts.priceCheckMeta', { sku: p.sku }),
        };
      }
      if (parsed.price === p.price) return { text: t('acts.priceSame', { name: p.name, price: M(p.price) }) };
      return {
        text: t('acts.pricePreview', {
          name: p.name,
          sku: p.sku,
          price: M(p.price),
          next: M(parsed.price),
          pct: Math.abs(Math.round(((parsed.price - p.price) / p.price) * 100)),
          dir: parsed.price > p.price ? t('acts.priceRise') : t('acts.priceCut'),
          from: Math.round(((p.price - p.cost) / p.price) * 100),
          to: Math.round(((parsed.price - p.cost) / parsed.price) * 100),
        }),
        table: {
          head: [t('common.field'), t('common.now'), t('common.after')],
          rows: [[t('common.price'), M(p.price), M(parsed.price)], [t('common.cost'), M(p.cost), M(p.cost)]],
        },
        meta: t('acts.readProduct', { sku: p.sku }),
        actions: [{ label: t('acts.priceLabel', { name: p.name, price: M(parsed.price) }), doingLabel: t('acts.priceSaving'), run: () => runPrice(p, parsed.price) }],
      };
    },
  };

  /* ---------- 3. move an order along the board ---------- */

  function runStage(order, stage) {
    const before = order.status;
    const steps = order.timeline.length;
    const at = new Date().toISOString();
    ctx.store.update((s) => {
      const o = s.orders.find((x) => x.id === order.id);
      if (!o) return;
      o.status = stage;
      o.updatedAt = at;
      o.timeline.push({ at, label: `Moved to ${stage} by Cartline Assist`, by: s.settings.counterName });
    });
    toast(t('orderops.moved', { no: order.no, stage: t(`data.statusRaw.${stage}`) }), 'ok');
    reveal(ctx, 'board');
    const o = ctx.state.orders.find((x) => x.id === order.id);
    return {
      text: t('acts.stageDone', {
        no: order.no,
        from: t(`data.statusRaw.${before}`),
        to: t(`data.statusRaw.${stage}`),
        customer: order.customer,
      }),
      table: {
        head: [t('common.field'), t('common.before'), t('common.after')],
        rows: [[t('acts.stageRow'), t(`data.status.${before}`), `**${t(`data.status.${stage}`)}**`], [t('acts.stageEntries'), String(steps), String(o ? o.timeline.length : steps + 1)]],
      },
      meta: t('acts.stageMeta', { no: order.no }),
      suggestions: [t('ask.openOrders'), t('ask.whereOrder', { no: order.no }), t('ask.whatCanYouDo')],
    };
  }

  const stage = {
    id: 'act-stage',
    /* Both regexes need the order number in them. A bare "CL-1052" is a
       question about an order, and belongs to the reader that answers it. */
    match: [
      /\b(move|advance|push|progress|bump)\b[^?]{0,60}?(?:cl[\s-]?\d{3,}|order\s*#?\s*\d{3,}|\b\d{3,}\b)/i,
      /\b(?:cl[\s-]?\d{3,}|order\s*#?\s*\d{3,})\b[^?]{0,30}\b(?:to|into)\s+(?:new|preparing|prep|ready|completed?|done)\b/i,
    ],
    trace: t('acts.stageTrace'),
    answer: (q) => {
      const parsed = parseStage(q);
      if (!parsed.ref) {
        const open = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed');
        return {
          text: t('acts.stageAsk', {
            tail: open.length
              ? t('acts.stageOpen', { count: countWord(open.length), n: open.length, list: open.slice(0, 3).map((o) => o.no).join(', ') })
              : t('acts.stageClear'),
          }),
          suggestions: [t('ask.openOrders'), t('ask.whatCanYouDo')],
        };
      }
      const o = orderByNo(ctx.state, parsed.ref);
      if (!o) return { text: t('acts.stageMissing', { n: parsed.ref }), suggestions: [t('ask.openOrders')] };
      if (o.status === 'refunded' || o.status === 'cancelled') {
        return { text: t('acts.stageClosed', { no: o.no, status: t(`data.statusRaw.${o.status}`) }), meta: t('acts.readOrder', { no: o.no }) };
      }
      const i = STATUSES.indexOf(o.status);
      const target = parsed.stage || STATUSES[Math.min(i + 1, STATUSES.length - 1)];
      if (target === o.status) return { text: t('acts.stageSame', { no: o.no, stage: t(`data.statusRaw.${target}`) }) };
      const back = STATUSES.indexOf(target) < i;
      return {
        text: t('acts.stagePreview', {
          no: o.no,
          customer: o.customer,
          channel: t(`data.channel.${o.channel}`).toLowerCase(),
          money: M(o.total),
          stage: t(`data.statusRaw.${o.status}`),
          ago: ago(o.placedAt),
          verb: back ? t('acts.stageBack') : t('acts.stageForward'),
          target: t(`data.statusRaw.${target}`),
        }),
        table: {
          head: [t('common.field'), t('common.now'), t('common.after')],
          rows: [[t('acts.stageRow'), t(`data.status.${o.status}`), t(`data.status.${target}`)], [t('acts.stageSince'), ago(o.placedAt), t('acts.stageJustNow')], [t('common.total'), M(o.total), M(o.total)]],
        },
        meta: t('acts.readBoard', { no: o.no }),
        actions: [{ label: t('acts.stageLabel', { no: o.no, stage: t(`data.statusRaw.${target}`) }), doingLabel: t('acts.stageMoving'), run: () => runStage(o, target) }],
      };
    },
  };

  /* ---------- 4. refund an order with a reason ---------- */

  function runRefund(order, reason) {
    const at = new Date().toISOString();
    const amount = order.total;
    const wasStatus = order.status;
    ctx.store.update((s) => {
      const o = s.orders.find((x) => x.id === order.id);
      if (!o) return;
      o.status = 'refunded';
      o.updatedAt = at;
      o.refund = { amount, reason, note: t('acts.refundNote'), at, by: s.settings.counterName };
      o.timeline.push({ at, label: `Refunded ${s.settings.currency}${amount}`, by: s.settings.counterName });
      o.items.forEach((it) => {
        const p = s.products.find((x) => x.id === it.productId);
        if (p) p.stock += it.qty;
      });
    });
    toast(t('orderops.refunded', { no: order.no }), 'bad');
    reveal(ctx, 'orders');
    const day = dayKey(new Date());
    const today = ctx.state.orders.filter((o) => o.status === 'refunded' && dayKey(o.placedAt) === day);
    return {
      text: t('acts.refundDone', {
        no: order.no,
        money: M(amount),
        customer: order.customer,
        reason: tr('refundReason', reason).toLowerCase(),
        items: num(order.items.reduce((sum, it) => sum + it.qty, 0)),
      }),
      table: {
        head: [t('common.field'), t('common.before'), t('common.after')],
        rows: [
          [t('common.status'), t(`data.status.${wasStatus}`), t('acts.refundedBold')],
          [t('acts.refundRowOnOrder'), t('common.dash'), M(amount)],
          [t('acts.refundRowToday'), String(today.length - 1), String(today.length)],
        ],
      },
      meta: t('acts.refundMeta', { no: order.no, n: num(order.items.length) }),
      suggestions: [t('ask.whyRefunds'), t('ask.revenue'), t('ask.whatCanYouDo')],
    };
  }

  const refund = {
    id: 'act-refund',
    /* One regex, and it only fires when the word refund is followed by an order
       number. "Why do orders get refunded?" is a question for the reader, not a
       refund to apply, and it does not match this. */
    match: [/\brefund(?:ing)?\b[^?]{0,60}?(?:cl[\s-]?\d{3,}|order\s*#?\s*\d{3,}|\b\d{3,}\b)/i],
    trace: t('acts.refundTrace'),
    answer: (q) => {
      const parsed = parseRefund(q);
      if (!parsed.ref) {
        return {
          text: t('acts.refundAsk'),
          suggestions: [t('ask.openOrders'), t('ask.whyRefunds')],
        };
      }
      const o = orderByNo(ctx.state, parsed.ref);
      if (!o) return { text: t('acts.refundMissing', { n: parsed.ref }), suggestions: [t('ask.openOrders')] };
      if (o.status === 'refunded') {
        return {
          text: t('acts.refundTwice', { no: o.no, money: M(o.refund.amount), reason: tr('refundReason', o.refund.reason).toLowerCase() }),
          meta: t('acts.refundReadMeta', { no: o.no }),
        };
      }
      if (o.status === 'cancelled') return { text: t('acts.refundCancelled', { no: o.no }) };
      const head = t('acts.refundHead', {
        no: o.no,
        customer: o.customer,
        money: M(o.total),
        payment: t(`data.payment.${o.payment}`),
        channel: t(`data.channel.${o.channel}`).toLowerCase(),
        ago: ago(o.placedAt),
      });
      if (!parsed.reason) {
        return {
          text: t('acts.refundNeedReason', { head, no: o.no }),
          meta: t('acts.refundReasonsMeta', { no: o.no }),
          actions: REFUND_REASONS.slice(0, 3).map((r) => ({ label: tr('refundReason', r), doingLabel: t('acts.refunding'), run: () => runRefund(o, r) })),
        };
      }
      return {
        text: t('acts.refundPreview', {
          head,
          money: M(o.total),
          reason: tr('refundReason', parsed.reason).toLowerCase(),
          units: num(o.items.reduce((sum, it) => sum + it.qty, 0)),
          lines: num(o.items.length),
        }),
        table: {
          head: [t('common.item'), t('common.qty'), t('common.line')],
          rows: o.items.map((it) => [it.name, String(it.qty), M(it.price * it.qty)]),
        },
        meta: t('acts.refundLinesMeta', { no: o.no, n: o.items.length }),
        actions: [{ label: t('acts.refundLabel', { money: M(o.total), no: o.no }), doingLabel: t('acts.refunding'), run: () => runRefund(o, parsed.reason) }],
      };
    },
  };

  /* ---------- 5. create a discount code from a sentence ---------- */

  function runDiscount(d) {
    ctx.store.update((s) => { s.discounts.push({ ...d, active: true, uses: 0, maxUses: 0 }); });
    toast(t('acts.codeToast', { code: d.code }), 'ok');
    reveal(ctx, 'discounts');
    return {
      text: t('acts.codeDone', { code: d.code }),
      table: {
        head: [t('common.field'), t('common.value')],
        rows: [
          [t('common.code'), d.code],
          [t('common.discount'), d.kind === 'pct' ? t('discounts.pctOff', { value: d.value }) : t('discounts.flatOff', { money: M(d.value) })],
          [t('acts.codeMinRow'), d.minOrder ? M(d.minOrder) : t('common.none')],
          [t('common.state'), t('acts.codeStateActive')],
          [t('common.note'), d.note],
        ],
      },
      meta: t('acts.codeDoneMeta', { n: num(ctx.state.discounts.length) }),
      suggestions: [t('ask.costliestCode'), t('ask.aov'), t('ask.whatCanYouDo')],
    };
  }

  const discount = {
    id: 'act-discount',
    match: [
      /\b(\d{1,2})\s*(?:%|percent|per cent)\s*off\b/i,
      /\bcode\s+["']?[A-Z][A-Z0-9]{2,15}\b/,
      /\b(create|make|add|set up|new|launch|start|run)\b.*\b(code|discount|offer|coupon|promo)\b/i,
    ],
    trace: t('acts.codeTrace'),
    answer: (q) => {
      const d = parseDiscount(q);
      if (!d.kind || !d.value) {
        return {
          text: t('acts.codeAskSize'),
          suggestions: [t('ask.costliestCode'), t('ask.whatCanYouDo')],
        };
      }
      if (!d.code) {
        return {
          text: t('acts.codeAskName', {
            off: d.kind === 'pct' ? t('discounts.pctOff', { value: d.value }) : t('discounts.flatOff', { money: M(d.value) }),
            scope: d.scope ? t('acts.codeScope', { name: catName(d.scopeId).toLowerCase() }) : '',
          }),
          meta: t('acts.codeNoWord'),
        };
      }
      if (discountByCode(ctx.state, d.code)) {
        const ex = discountByCode(ctx.state, d.code);
        return {
          text: t('acts.codeExists', {
            code: d.code,
            off: ex.kind === 'pct' ? t('discounts.pctOff', { value: ex.value }) : t('discounts.flatOff', { money: M(ex.value) }),
            state: ex.active ? t('reads.stateActive') : t('reads.statePaused'),
            uses: num(ex.uses),
          }),
          meta: t('acts.codeCheckedMeta', { n: num(ctx.state.discounts.length) }),
        };
      }
      if (d.kind === 'pct' && d.value > 60) {
        return { text: t('acts.codeCeiling', { value: d.value }) };
      }
      const note = [d.scope ? t('acts.codePromo', { scope: catName(d.scopeId) }) : t('acts.codeStorefront'),
        d.until ? t('acts.codeUntil', { until: d.until }) : null].filter(Boolean).join(', ');
      const payload = { code: d.code, kind: d.kind, value: d.value, minOrder: d.minOrder || 0, note };
      return {
        text: t('acts.codePreview', {
          until: d.until ? t('acts.codeUntilNote', { until: d.until }) : '',
          scope: d.scope ? t('acts.codeScopeNote', { scope: catName(d.scopeId).toLowerCase() }) : '',
        }),
        table: {
          head: [t('common.field'), t('common.value')],
          rows: [
            [t('common.code'), d.code],
            [t('common.discount'), d.kind === 'pct' ? t('discounts.pctOff', { value: d.value }) : t('discounts.flatOff', { money: M(d.value) })],
            [t('acts.codeMinRow'), d.minOrder ? M(d.minOrder) : t('common.none')],
            [t('common.note'), note],
          ],
        },
        meta: t('acts.codeMeta', { code: d.code, n: num(ctx.state.discounts.length) }),
        actions: [{ label: t('acts.codeLabel', { code: d.code }), doingLabel: t('acts.codeCreating'), run: () => runDiscount(payload) }],
      };
    },
  };

  /* ---------- 6. out of stock / back in stock ---------- */

  function runAvailability(p, out, qty) {
    const before = p.stock;
    const after = out ? 0 : Math.max(1, qty || 20);
    ctx.store.update((s) => {
      const t = s.products.find((x) => x.id === p.id);
      if (!t) return;
      t.stock = after;
      t.active = true;
      if (out) s.cart.items = s.cart.items.filter((it) => it.productId !== p.id);
    });
    toast(out ? t('acts.availOutToast', { name: p.name }) : t('acts.availBackToast', { name: p.name }), out ? '' : 'ok');
    reveal(ctx, 'products');
    return {
      text: out
        ? t('acts.availOutDone', { name: p.name, tail: before ? t('acts.availOutTail', { n: num(before) }) : '' })
        : t('acts.availBackDone', { name: p.name, n: num(after) }),
      table: {
        head: [t('common.field'), t('common.before'), t('common.after')],
        rows: [
          [t('common.stock'), String(before), `**${after}**`],
          [t('acts.availStorefront'), before > 0 ? t('acts.availOnSale') : t('acts.availSoldOut'), after > 0 ? t('acts.availOnSale') : t('acts.availSoldOut')],
        ],
      },
      meta: t('acts.wroteProduct', { sku: p.sku }),
      suggestions: [t('ask.lowStock'), t('ask.whatCanYouDo')],
    };
  }

  const availability = {
    id: 'act-availability',
    /* The verb and the phrase have to be in the same sentence, so "what is out
       of stock" stays a question the low-stock reader answers. */
    match: [/\b(mark|set|flag|make|put|pull|take)\b[^?]{0,48}\b(out of stock|sold out|unavailable|not available|off the menu|back in stock|in stock again|available again|back on sale|back on the menu)\b/i],
    trace: t('acts.availTrace'),
    answer: (q) => {
      const parsed = parseAvailability(q);
      if (!parsed.out && !parsed.back) return null;
      if (!parsed.term) return { text: t('acts.availAsk') };
      const hits = matchProducts(ctx.state, parsed.term);
      if (!hits.length) return noProduct(ctx.state, parsed.term);
      if (hits.length > 1) {
        return ambiguousProduct(hits, parsed.term,
          (p) => (parsed.out ? t('acts.availOutChip', { name: p.name }) : t('acts.availBackChip', { name: p.name })),
          (p) => runAvailability(p, parsed.out, parsed.qty));
      }
      const p = hits[0];
      if (parsed.out && p.stock === 0) return { text: t('acts.availAlreadyOut', { name: p.name }) };
      if (parsed.back && p.stock > 0) {
        return {
          text: t('acts.availAlreadyOn', { name: p.name, n: num(p.stock) }),
          suggestions: [t('ask.lowStock')],
        };
      }
      const after = parsed.out ? 0 : Math.max(1, parsed.qty || 20);
      return {
        text: parsed.out
          ? t('acts.availOutPreview', { name: p.name, sku: p.sku, n: num(p.stock) })
          : t('acts.availBackPreview', { name: p.name, sku: p.sku, n: num(after), tail: parsed.qty ? '' : t('acts.availDefaultTail') }),
        table: {
          head: [t('common.field'), t('common.now'), t('common.after')],
          rows: [[t('common.stock'), String(p.stock), String(after)], [t('acts.availStorefront'), p.stock > 0 ? t('acts.availOnSale') : t('acts.availSoldOut'), after > 0 ? t('acts.availOnSale') : t('acts.availSoldOut')]],
        },
        meta: t('acts.readProduct', { sku: p.sku }),
        actions: [{
          label: parsed.out ? t('acts.availOutLabel', { name: p.name }) : t('acts.availBackLabel', { name: p.name }),
          doingLabel: t('acts.applying'),
          run: () => runAvailability(p, parsed.out, parsed.qty),
        }],
      };
    },
  };

  /* Order matters when two intents score the same: the more specific sentence
     shape goes first. "Put X back in stock" is availability, not a price. */
  return [restock, availability, price, stage, refund, discount];
}

/* ============================================================
   What the agent can do, in one list. The same rows feed the
   "What can you do?" answer and the About modal, so the two can
   never drift apart.
   ============================================================ */

export const ACTION_EXAMPLES = () => t('examples.actions');

export const READ_EXAMPLES = () => t('examples.reads');

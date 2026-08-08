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

import { money, num, toast, ago } from '../lib/ui.js';
import {
  CATEGORIES, REFUND_REASONS, STATUSES, dayKey, orderByNo, discountByCode,
} from './data.js';

/* ---------- small language helpers ---------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const COUNT_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n) => (n < COUNT_WORD.length ? COUNT_WORD[n] : String(n));
const titleCase = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

const STAGE_WORD = {
  new: 'new', preparing: 'preparing', prep: 'preparing', ready: 'ready',
  complete: 'completed', completed: 'completed', done: 'completed', 'handed over': 'completed',
};
const STAGE_LABEL = {
  new: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed',
  refunded: 'Refunded', cancelled: 'Cancelled',
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
    text: `Nothing in the catalogue is called "${term}". ${near.length ? `Did you mean ${near.map((p) => `**${p.name}**`).join(', ')}?` : `There are ${num(state.products.length)} products — ask "what is low on stock" if you want the list.`}`,
    meta: `searched ${num(state.products.length)} product names and SKUs`,
    suggestions: ['What is low on stock?', 'What can you do?'],
  };
}

/* One refusal shape for every product action: name the clash, list it, and
   offer the exact records as buttons so the next press is unambiguous. */
function ambiguousProduct(list, term, label, run) {
  return {
    text: `${titleCase(countWord(list.length))} products match "${term}" — I will not guess which one you mean. Pick the exact record.`,
    table: {
      head: ['Product', 'SKU', 'Stock', 'Price'],
      rows: list.slice(0, 6).map((p) => [p.name, p.sku, String(p.stock), String(p.price)]),
    },
    meta: `matched ${num(list.length)} products on "${term}"`,
    actions: list.slice(0, 4).map((p) => ({ label: label(p), doingLabel: 'Applying…', run: () => run(p) })),
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
  const fmt = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' });
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
    until: untilM ? readDeadline(untilM[1]) : null,
  };
}

function parseAvailability(q) {
  const out = /\b(out of stock|sold out|unavailable|not available|off the menu|off sale)\b/i.test(q);
  const back = /\b(back in stock|in stock again|available again|back on (?:the )?(?:menu|sale)|back on)\b/i.test(q);
  const qtyM = q.match(/\b(?:with|at|to)\s+(\d+)\b/i) || q.match(/\b(\d+)\s*(?:units?|pcs?|pieces?)\b/i);
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
    toast(`${p.name} restocked to ${after}`, 'ok');
    reveal(ctx, 'products');
    const limit = ctx.state.settings.lowStockAt;
    return {
      text: `Done. **${p.name}** (${p.sku}) went from ${num(before)} to **${num(after)}** units.${after > limit && before <= limit ? ' It is off the low-stock list now.' : ''}`,
      table: {
        head: ['Field', 'Before', 'After'],
        rows: [
          ['Stock', String(before), `**${after}**`],
          ['State', before <= limit ? (before === 0 ? 'Out of stock' : 'Low stock') : 'Listed', after <= limit ? (after === 0 ? 'Out of stock' : 'Low stock') : 'Listed'],
          ['Stock at cost', M(before * p.cost), M(after * p.cost)],
        ],
      },
      meta: `wrote ${p.sku} to the product table`,
      suggestions: ['What is low on stock?', 'How much stock do we hold?', 'What can you do?'],
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
    trace: 'read the stock line for the product you named',
    answer: (q) => {
      const { term, qty } = parseRestock(q);
      if (!term) return { text: 'Name the product and I will take its stock up — for example "restock Karak Chai by 24".', suggestions: ['What is low on stock?', 'What can you do?'] };
      const hits = matchProducts(ctx.state, term);
      if (!hits.length) return noProduct(ctx.state, term);
      const amount = qty || 20;
      if (hits.length > 1) {
        return ambiguousProduct(hits, term, (p) => `${p.name} +${amount}`, (p) => runRestock(p, amount));
      }
      const p = hits[0];
      return {
        text: `**${p.name}** (${p.sku}) is on ${num(p.stock)} units. Adding ${num(amount)} takes it to **${num(p.stock + amount)}**${qty ? '' : ' — 20 is my default, say "by 40" for another number'}.`,
        table: {
          head: ['Field', 'Now', 'After'],
          rows: [['Stock', String(p.stock), String(p.stock + amount)], ['At cost', M(p.stock * p.cost), M((p.stock + amount) * p.cost)]],
        },
        meta: `read ${p.sku} from the product table`,
        actions: [{ label: `Restock ${p.name} by ${amount}`, doingLabel: 'Restocking…', run: () => runRestock(p, amount) }],
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
    toast(`${p.name} is now ${M(price)}`, 'ok');
    reveal(ctx, 'products');
    const margin = (v) => `${Math.round(((v - p.cost) / v) * 100)}%`;
    return {
      text: `**${p.name}** is now ${M(price)}, ${price >= before ? 'up' : 'down'} from ${M(before)}. The storefront and the cart use the new price from the next order; orders already placed keep the price they were billed at.`,
      table: {
        head: ['Field', 'Before', 'After'],
        rows: [['Price', M(before), `**${M(price)}**`], ['Cost', M(p.cost), M(p.cost)], ['Margin', margin(before), margin(price)]],
      },
      meta: `wrote ${p.sku} to the product table`,
      suggestions: ['What sold best today?', 'Which category earns most?', 'What can you do?'],
    };
  }

  const price = {
    id: 'act-price',
    match: [/\bprice\b/i, /\b(change|set|update|make|drop|raise|reduce|increase)\b/i, /\b(?:to|at)\s*(?:₹|rs\.?|inr)?\s*\d+/i],
    trace: 'read the price and cost of the product you named',
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
            text: `**${p.name}** (${p.sku}) sells at ${M(p.price)}, costs ${M(p.cost)}, margin ${Math.round(((p.price - p.cost) / p.price) * 100)}%. ${num(p.stock)} units on hand.\n\nSay "change the price of ${p.name} to ${p.price + 5}" and I will do it.`,
            meta: `read ${p.sku} from the product table`,
            suggestions: ['What sold best today?', 'What is low on stock?', 'What can you do?'],
          };
        }
        return {
          text: 'Say it as "change the price of Filter Coffee to 45" and I will show you the before and after before anything moves.',
          suggestions: ['What can you do?', 'What sold best today?'],
        };
      }
      const hits = matchProducts(ctx.state, parsed.term);
      if (!hits.length) return noProduct(ctx.state, parsed.term);
      if (hits.length > 1) {
        return ambiguousProduct(hits, parsed.term, (p) => `${p.name} → ${M(parsed.price)}`, (p) => runPrice(p, parsed.price));
      }
      const p = hits[0];
      if (parsed.price <= p.cost) {
        return {
          text: `I will not set **${p.name}** to ${M(parsed.price)} — that is at or below its ${M(p.cost)} cost, so every sale would lose money. Give me a price above ${M(p.cost)}.`,
          meta: `checked ${p.sku} against its cost price`,
        };
      }
      if (parsed.price === p.price) return { text: `**${p.name}** is already ${M(p.price)}. Nothing to change.` };
      return {
        text: `**${p.name}** (${p.sku}) is ${M(p.price)} today. I would set it to **${M(parsed.price)}** — a ${Math.abs(Math.round(((parsed.price - p.price) / p.price) * 100))}% ${parsed.price > p.price ? 'rise' : 'cut'}, margin ${Math.round(((p.price - p.cost) / p.price) * 100)}% → ${Math.round(((parsed.price - p.cost) / parsed.price) * 100)}%.`,
        table: {
          head: ['Field', 'Now', 'After'],
          rows: [['Price', M(p.price), M(parsed.price)], ['Cost', M(p.cost), M(p.cost)]],
        },
        meta: `read ${p.sku} from the product table`,
        actions: [{ label: `Set ${p.name} to ${M(parsed.price)}`, doingLabel: 'Saving…', run: () => runPrice(p, parsed.price) }],
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
    toast(`${order.no} → ${stage}`, 'ok');
    reveal(ctx, 'board');
    const o = ctx.state.orders.find((x) => x.id === order.id);
    return {
      text: `**${order.no}** moved from ${STAGE_LABEL[before].toLowerCase()} to **${STAGE_LABEL[stage].toLowerCase()}**. ${order.customer} sees the same step on the tracking screen.`,
      table: {
        head: ['Field', 'Before', 'After'],
        rows: [['Stage', STAGE_LABEL[before], `**${STAGE_LABEL[stage]}**`], ['Timeline entries', String(steps), String(o ? o.timeline.length : steps + 1)]],
      },
      meta: `wrote ${order.no} and appended one timeline entry`,
      suggestions: ['Show the open orders', `Where is order ${order.no}?`, 'What can you do?'],
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
    trace: 'read the order and the columns either side of it',
    answer: (q) => {
      const parsed = parseStage(q);
      if (!parsed.ref) {
        const open = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed');
        return {
          text: `Give me the number — "move CL-1052 to ready". ${open.length ? `${countWord(open.length)} orders are open right now, oldest first: ${open.slice(0, 3).map((o) => o.no).join(', ')}.` : 'The board is clear at the moment.'}`,
          suggestions: ['Show the open orders', 'What can you do?'],
        };
      }
      const o = orderByNo(ctx.state, parsed.ref);
      if (!o) return { text: `There is no order numbered ${parsed.ref} here. Numbers in this demo run from CL-1042 upwards.`, suggestions: ['Show the open orders'] };
      if (o.status === 'refunded' || o.status === 'cancelled') {
        return { text: `**${o.no}** is ${o.status} — a closed order does not go back on the board. Only a demo reset brings it back.`, meta: `read ${o.no}` };
      }
      const i = STATUSES.indexOf(o.status);
      const target = parsed.stage || STATUSES[Math.min(i + 1, STATUSES.length - 1)];
      if (target === o.status) return { text: `**${o.no}** is already ${STAGE_LABEL[target].toLowerCase()}. Nothing to move.` };
      const back = STATUSES.indexOf(target) < i;
      return {
        text: `**${o.no}** — ${o.customer}, ${o.channel.toLowerCase()}, ${M(o.total)} — sits at **${STAGE_LABEL[o.status].toLowerCase()}**, placed ${ago(o.placedAt)}. I would ${back ? 'send it back to' : 'move it to'} **${STAGE_LABEL[target].toLowerCase()}**.`,
        table: {
          head: ['Field', 'Now', 'After'],
          rows: [['Stage', STAGE_LABEL[o.status], STAGE_LABEL[target]], ['On the board since', ago(o.placedAt), 'moved just now'], ['Total', M(o.total), M(o.total)]],
        },
        meta: `read ${o.no} from the order board`,
        actions: [{ label: `Move ${o.no} to ${STAGE_LABEL[target].toLowerCase()}`, doingLabel: 'Moving…', run: () => runStage(o, target) }],
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
      o.refund = { amount, reason, note: 'Refunded from Cartline Assist.', at, by: s.settings.counterName };
      o.timeline.push({ at, label: `Refunded ${s.settings.currency}${amount}`, by: s.settings.counterName });
      o.items.forEach((it) => {
        const p = s.products.find((x) => x.id === it.productId);
        if (p) p.stock += it.qty;
      });
    });
    toast(`${order.no} refunded`, 'bad');
    reveal(ctx, 'orders');
    const day = dayKey(new Date());
    const today = ctx.state.orders.filter((o) => o.status === 'refunded' && dayKey(o.placedAt) === day);
    return {
      text: `**${order.no}** is refunded — ${M(amount)} back to ${order.customer}, reason recorded as "${reason.toLowerCase()}". The ${num(order.items.reduce((t, it) => t + it.qty, 0))} items went back into stock and today's net revenue drops by ${M(amount)}.`,
      table: {
        head: ['Field', 'Before', 'After'],
        rows: [
          ['Status', STAGE_LABEL[wasStatus], '**Refunded**'],
          ['Refund on the order', '—', M(amount)],
          ['Refunds today', String(today.length - 1), String(today.length)],
        ],
      },
      meta: `wrote ${order.no}, its refund record and ${num(order.items.length)} stock lines`,
      suggestions: ['Why do orders get refunded?', "What is today's revenue?", 'What can you do?'],
    };
  }

  const refund = {
    id: 'act-refund',
    /* One regex, and it only fires when the word refund is followed by an order
       number. "Why do orders get refunded?" is a question for the reader, not a
       refund to apply, and it does not match this. */
    match: [/\brefund(?:ing)?\b[^?]{0,60}?(?:cl[\s-]?\d{3,}|order\s*#?\s*\d{3,}|\b\d{3,}\b)/i],
    trace: 'read the order, its payment and its lines',
    answer: (q) => {
      const parsed = parseRefund(q);
      if (!parsed.ref) {
        return {
          text: 'Which order? Say "refund CL-1049, wrong item packed" and I will show you the amount and the reason before it goes through.',
          suggestions: ['Show the open orders', 'Why do orders get refunded?'],
        };
      }
      const o = orderByNo(ctx.state, parsed.ref);
      if (!o) return { text: `No order numbered ${parsed.ref} exists here.`, suggestions: ['Show the open orders'] };
      if (o.status === 'refunded') {
        return { text: `**${o.no}** was already refunded ${M(o.refund.amount)} — ${o.refund.reason.toLowerCase()}. I will not refund it twice.`, meta: `read the refund record on ${o.no}` };
      }
      if (o.status === 'cancelled') return { text: `**${o.no}** was cancelled before the kitchen touched it, so nothing was taken to give back.` };
      const head = `**${o.no}** — ${o.customer} paid ${M(o.total)} by ${o.payment}, ${o.channel.toLowerCase()}, placed ${ago(o.placedAt)}.`;
      if (!parsed.reason) {
        return {
          text: `${head}\n\nA refund needs a reason on it, otherwise nobody can review it later. Pick one, or say "refund ${o.no} because the delivery was late".`,
          meta: `read ${o.no} and the five recorded refund reasons`,
          actions: REFUND_REASONS.slice(0, 3).map((r) => ({ label: r, doingLabel: 'Refunding…', run: () => runRefund(o, r) })),
        };
      }
      return {
        text: `${head} Refunding the full ${M(o.total)} with the reason "${parsed.reason.toLowerCase()}", and the ${num(o.items.reduce((t, it) => t + it.qty, 0))} units across ${num(o.items.length)} lines go back into stock.`,
        table: {
          head: ['Item', 'Qty', 'Line'],
          rows: o.items.map((it) => [it.name, String(it.qty), M(it.price * it.qty)]),
        },
        meta: `read ${o.no} and its ${o.items.length} lines`,
        actions: [{ label: `Refund ${M(o.total)} on ${o.no}`, doingLabel: 'Refunding…', run: () => runRefund(o, parsed.reason) }],
      };
    },
  };

  /* ---------- 5. create a discount code from a sentence ---------- */

  function runDiscount(d) {
    ctx.store.update((s) => { s.discounts.push({ ...d, active: true, uses: 0, maxUses: 0 }); });
    toast(`${d.code} is live on the storefront`, 'ok');
    reveal(ctx, 'discounts');
    return {
      text: `**${d.code}** is live. Type it into the cart on the storefront and it comes off the basket straight away. Pause it any time from Discount codes.`,
      table: {
        head: ['Field', 'Value'],
        rows: [
          ['Code', d.code],
          ['Discount', d.kind === 'pct' ? `${d.value}% off` : `${M(d.value)} off`],
          ['Minimum basket', d.minOrder ? M(d.minOrder) : 'None'],
          ['State', 'Active'],
          ['Note', d.note],
        ],
      },
      meta: `added one row to the discount table — ${num(ctx.state.discounts.length)} codes now`,
      suggestions: ['Which discount code costs most?', 'What is the average order value?', 'What can you do?'],
    };
  }

  const discount = {
    id: 'act-discount',
    match: [
      /\b(\d{1,2})\s*(?:%|percent|per cent)\s*off\b/i,
      /\bcode\s+["']?[A-Z][A-Z0-9]{2,15}\b/,
      /\b(create|make|add|set up|new|launch|start|run)\b.*\b(code|discount|offer|coupon|promo)\b/i,
    ],
    trace: 'read the existing code list before writing a new one',
    answer: (q) => {
      const d = parseDiscount(q);
      if (!d.kind || !d.value) {
        return {
          text: 'Tell me the size of it — "10% off drinks until Friday, code MONSOON", or "₹75 off baskets over ₹600, code PANTRY75".',
          suggestions: ['Which discount code costs most?', 'What can you do?'],
        };
      }
      if (!d.code) {
        return {
          text: `I have the discount — ${d.kind === 'pct' ? `${d.value}% off` : `${M(d.value)} off`}${d.scope ? ` on ${d.scope.toLowerCase()}` : ''} — but not the code itself. Add "code MONSOON" and I will create it.`,
          meta: 'parsed the sentence but found no code word',
        };
      }
      if (discountByCode(ctx.state, d.code)) {
        const ex = discountByCode(ctx.state, d.code);
        return {
          text: `**${d.code}** already exists — ${ex.kind === 'pct' ? `${ex.value}% off` : `${M(ex.value)} off`}, ${ex.active ? 'active' : 'paused'}, used ${num(ex.uses)} times. I will not overwrite a live code. Pick another name.`,
          meta: `checked ${num(ctx.state.discounts.length)} existing codes`,
        };
      }
      if (d.kind === 'pct' && d.value > 60) {
        return { text: `${d.value}% is past the 60% ceiling this store keeps on percentage codes. Give me 60 or less.` };
      }
      const note = [d.scope ? `${d.scope} promotion` : 'Storefront promotion',
        d.until ? `until ${d.until}` : null].filter(Boolean).join(', ');
      const payload = { code: d.code, kind: d.kind, value: d.value, minOrder: d.minOrder || 0, note };
      return {
        text: `Here is what I read out of that. ${d.until ? `The demo's codes carry no expiry field, so "until ${d.until}" goes into the note rather than switching itself off — pause it from Discount codes when the day comes.` : ''}${d.scope ? ` The same goes for "${d.scope.toLowerCase()}" — a code applies to the whole basket here, so the scope is recorded in the note.` : ''}`,
        table: {
          head: ['Field', 'Value'],
          rows: [
            ['Code', d.code],
            ['Discount', d.kind === 'pct' ? `${d.value}% off` : `${M(d.value)} off`],
            ['Minimum basket', d.minOrder ? M(d.minOrder) : 'None'],
            ['Note', note],
          ],
        },
        meta: `checked ${d.code} against ${num(ctx.state.discounts.length)} existing codes`,
        actions: [{ label: `Create ${d.code}`, doingLabel: 'Creating…', run: () => runDiscount(payload) }],
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
    toast(out ? `${p.name} marked out of stock` : `${p.name} is back on sale`, out ? '' : 'ok');
    reveal(ctx, 'products');
    return {
      text: out
        ? `**${p.name}** is out of stock. The storefront card now reads "Sold out" and it cannot be added to a cart${before ? ` — the ${num(before)} units it was carrying are written off` : ''}.`
        : `**${p.name}** is back on sale with ${num(after)} units. It shows "In stock" on the storefront again.`,
      table: {
        head: ['Field', 'Before', 'After'],
        rows: [
          ['Stock', String(before), `**${after}**`],
          ['Storefront', before > 0 ? 'On sale' : 'Sold out', after > 0 ? 'On sale' : 'Sold out'],
        ],
      },
      meta: `wrote ${p.sku} to the product table`,
      suggestions: ['What is low on stock?', 'What can you do?'],
    };
  }

  const availability = {
    id: 'act-availability',
    /* The verb and the phrase have to be in the same sentence, so "what is out
       of stock" stays a question the low-stock reader answers. */
    match: [/\b(mark|set|flag|make|put|pull|take)\b[^?]{0,48}\b(out of stock|sold out|unavailable|not available|off the menu|back in stock|in stock again|available again|back on sale|back on the menu)\b/i],
    trace: 'read the product and what the storefront shows for it',
    answer: (q) => {
      const parsed = parseAvailability(q);
      if (!parsed.out && !parsed.back) return null;
      if (!parsed.term) return { text: 'Name the product — "mark Mango Lassi out of stock", or "put Mango Lassi back in stock with 24".' };
      const hits = matchProducts(ctx.state, parsed.term);
      if (!hits.length) return noProduct(ctx.state, parsed.term);
      if (hits.length > 1) {
        return ambiguousProduct(hits, parsed.term,
          (p) => `${p.name} ${parsed.out ? 'out of stock' : 'back on'}`,
          (p) => runAvailability(p, parsed.out, parsed.qty));
      }
      const p = hits[0];
      if (parsed.out && p.stock === 0) return { text: `**${p.name}** is already showing sold out on the storefront. Nothing to change.` };
      if (parsed.back && p.stock > 0) {
        return {
          text: `**${p.name}** is already on sale with ${num(p.stock)} units. Say "restock ${p.name} by 20" if you want more of it.`,
          suggestions: ['What is low on stock?'],
        };
      }
      const after = parsed.out ? 0 : Math.max(1, parsed.qty || 20);
      return {
        text: parsed.out
          ? `**${p.name}** (${p.sku}) has ${num(p.stock)} units on the books. Marking it out of stock writes the stock to zero, takes it off any open cart and shows "Sold out" on the storefront card. The product stays listed, so it comes back with one line.`
          : `**${p.name}** (${p.sku}) is at zero. I would put ${num(after)} units back on it and the storefront card goes back to "In stock"${parsed.qty ? '' : ' — 20 is my default'}.`,
        table: { head: ['Field', 'Now', 'After'], rows: [['Stock', String(p.stock), String(after)], ['Storefront', p.stock > 0 ? 'On sale' : 'Sold out', after > 0 ? 'On sale' : 'Sold out']] },
        meta: `read ${p.sku} from the product table`,
        actions: [{
          label: parsed.out ? `Mark ${p.name} out of stock` : `Put ${p.name} back on sale`,
          doingLabel: 'Applying…',
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

export const ACTION_EXAMPLES = [
  {
    ask: 'Restock Karak Chai by 24',
    reply: 'Names the exact product and its SKU, shows 6 → 30 with the stock value either side, and writes it to Products and stock when you press Restock.',
  },
  {
    ask: 'Change the price of Filter Coffee to 45',
    reply: 'Shows the old price, the new one, and what it does to the margin. Refuses any price at or below cost.',
  },
  {
    ask: 'Move CL-1052 to ready',
    reply: 'Pulls the order, shows preparing → ready, and on confirmation moves the card on the board and appends a timeline entry the customer can see.',
  },
  {
    ask: 'Refund CL-1049, wrong item packed',
    reply: 'Shows the customer, the amount and every line. Applying it marks the order refunded, records the reason and puts the items back into stock. With no reason given it offers the recorded reasons as buttons.',
  },
  {
    ask: '10% off drinks until Friday, code MONSOON',
    reply: 'Reads the size, the code and the date out of the sentence, says plainly what the demo can and cannot enforce, and creates the code live on the storefront.',
  },
  {
    ask: 'Mark Mango Lassi out of stock',
    reply: 'Writes the stock to zero, drops it from any open cart and flips the storefront card to "Sold out". "Put Mango Lassi back in stock with 24" reverses it.',
  },
];

export const READ_EXAMPLES = [
  { ask: "What is today's revenue?", reply: 'Gross, net after refunds and the comparison against yesterday, from the orders on file.' },
  { ask: 'What sold best today?', reply: "Today's order lines grouped by product, top five with quantity and revenue." },
  { ask: 'What is low on stock?', reply: 'Every product at or below the low-stock threshold, and what a top-up would cost at cost price.' },
  { ask: 'Where is order CL-1052?', reply: 'The order, its stage, what is on it and when it was last touched.' },
];

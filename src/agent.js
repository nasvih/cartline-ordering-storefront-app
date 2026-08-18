/* ============================================================
   Cartline Assist — the in-app agent.
   Every answer is assembled here from the live store: place an order,
   refund one, restock a product, and the replies change with it.
   There is no model and no network call anywhere in this file.

   Two kinds of intent live behind this agent. The ones in src/actions.js
   change the shop and are listed first, because an instruction should never
   be answered as though it were a question. The ones below only read.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { money, num, pct, ago } from '../lib/ui.js';
import {
  dayKey, dayLabel, lastDays, daySummary, topItems, revenueByHour, revenueByCategory,
  ordersOn, lowStock, orderByNo, STATUSES,
} from './data.js';
import { actionIntents, ACTION_EXAMPLES, READ_EXAMPLES } from './actions.js';
import { t, tlist } from './main.js';
import { tr } from './strings.js';

const STEP_LABEL = (status) => t(`data.statusRaw.${status}`);

export function buildAgent(ctx) {
  const cur = () => ctx.state.settings.currency;
  const today = () => dayKey(new Date());
  const M = (n) => money(n, cur());

  const reads = [
    {
      id: 'revenue-today',
      match: [/revenue|takings|sales|turnover|how much.*(made|sold)|money/i, 'revenue today'],
      trace: t('reads.revenueTrace'),
      answer: () => {
        const s = daySummary(ctx.state, today());
        const y = daySummary(ctx.state, lastDays(2)[1]);
        const diff = y.gross ? Math.round(((s.gross - y.gross) / y.gross) * 100) : 0;
        return {
          text: t('reads.revenueText', {
            gross: M(s.gross),
            orders: num(s.orders),
            net: M(s.net),
            refunds: M(s.refunds),
            yGross: M(y.gross),
            dir: diff >= 0 ? t('reads.up') : t('reads.down'),
            diff: Math.abs(diff),
          }),
          table: {
            head: [t('reads.measure'), t('common.today'), t('common.yesterday')],
            rows: [
              [t('reads.ordersRow'), num(s.orders), num(y.orders)],
              [t('reads.grossRow'), M(s.gross), M(y.gross)],
              [t('reads.refundsRow'), M(s.refunds), M(y.refunds)],
              [t('reads.netRow'), M(s.net), M(y.net)],
              [t('reads.avgOrderRow'), M(s.aov), M(y.aov)],
            ],
          },
          suggestions: [t('ask.bestSellers'), t('ask.lowStock'), t('ask.week')],
        };
      },
    },
    {
      id: 'best-sellers',
      match: [/sold best|best sell|bestsell|top item|top sell|most sold|popular|what.*sold/i, 'best sellers'],
      trace: t('reads.bestTrace'),
      answer: () => {
        const items = topItems(ctx.state, today(), 5);
        if (!items.length) return { text: t('reads.bestNone') };
        const lead = items[0];
        return {
          text: t('reads.bestText', { name: lead.name, qty: num(lead.qty), money: M(lead.revenue) }),
          table: {
            head: [t('common.item'), t('common.sold'), t('common.revenue')],
            rows: items.map((it) => [it.name, num(it.qty), M(it.revenue)]),
          },
          suggestions: [t('ask.category'), t('ask.lowStock'), t('ask.aov')],
        };
      },
    },
    {
      id: 'low-stock',
      /* "restock X" is an instruction handled in src/actions.js, so this
         reader only claims the question shapes. */
      match: [/\blow\b.{0,4}stock|running out|reorder|out of stock|stock level|need.*reorder/i, 'low stock'],
      trace: t('reads.lowTrace'),
      answer: () => {
        const low = lowStock(ctx.state);
        const limit = ctx.state.settings.lowStockAt;
        if (!low.length) return { text: t('reads.lowNone', { limit: num(limit) }) };
        const zero = low.filter((p) => p.stock === 0);
        const cost = low.reduce((t2, p) => t2 + (20 - p.stock) * p.cost, 0);
        return {
          text: t('reads.lowText', {
            n: num(low.length),
            limit: num(limit),
            zero: zero.length ? num(zero.length) : 0,
            cost: M(cost),
          }),
          table: {
            head: [t('common.product'), t('common.stock'), t('reads.soldToday')],
            rows: low.slice(0, 8).map((p) => [p.name, String(p.stock), num(soldToday(ctx, p.id))]),
          },
          suggestions: [t('ask.bestSellers'), t('ask.stockValue'), t('ask.openOrders')],
        };
      },
    },
    {
      id: 'order-status',
      match: [/\bCL[- ]?\d+/i, /order\s+#?\d{3,}/i, /where is (my )?order|order status|track|order number|order by number|look ?up an order|find an order/i],
      trace: t('reads.orderTrace'),
      answer: (q) => {
        const m = q.match(/\d{3,}/);
        if (!m) {
          const last = ctx.state.orders[0];
          return {
            text: t('reads.orderNoNumber', {
              no: last.no, customer: last.customer, stage: STEP_LABEL(last.status),
            }),
          };
        }
        const o = orderByNo(ctx.state, m[0]);
        if (!o) return { text: t('reads.orderMissing', { n: m[0] }) };
        const line = o.status === 'refunded'
          ? t('reads.orderRefunded', {
            money: M(o.refund.amount),
            reason: tr('refundReason', o.refund.reason).toLowerCase(),
          })
          : o.status === 'cancelled'
            ? t('reads.orderCancelled')
            : t('reads.orderAt', { stage: STEP_LABEL(o.status), ago: ago(o.updatedAt) });
        return {
          text: t('reads.orderHead', {
            no: o.no,
            customer: o.customer,
            channel: t(`data.channel.${o.channel}`).toLowerCase(),
            money: M(o.total),
            payment: t(`data.payment.${o.payment}`),
            line,
          }),
          table: {
            head: [t('common.item'), t('common.qty'), t('common.line')],
            rows: o.items.map((it) => [it.name, String(it.qty), M(it.price * it.qty)]),
          },
          meta: t('reads.orderMeta', { no: o.no, n: o.timeline.length }),
          suggestions: [t('ask.whyRefunds'), t('ask.openOrders'), t('ask.revenue')],
        };
      },
    },
    {
      id: 'refunds',
      match: [/refund|money back|charge ?back|returned/i, 'refunds'],
      trace: t('reads.refundsTrace'),
      answer: () => {
        const days = lastDays(7);
        const refs = ctx.state.orders.filter((o) => o.status === 'refunded' && days.includes(dayKey(o.placedAt)));
        if (!refs.length) return { text: t('reads.refundsNone') };
        const total = refs.reduce((t2, o) => t2 + (o.refund ? o.refund.amount : o.total), 0);
        const byReason = new Map();
        refs.forEach((o) => {
          const r = o.refund ? tr('refundReason', o.refund.reason) : t('reads.notRecorded');
          byReason.set(r, (byReason.get(r) || 0) + 1);
        });
        const ranked = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
        return {
          text: t('reads.refundsText', {
            n: num(refs.length), money: M(total), reason: ranked[0][0].toLowerCase(),
          }),
          table: {
            head: [t('reads.reasonRow'), t('reads.ordersRow')],
            rows: ranked.map(([r, n]) => [r, num(n)]),
          },
          suggestions: [t('ask.revenue'), t('ask.openOrders'), t('ask.category')],
        };
      },
    },
    {
      id: 'aov',
      match: [/average order|basket size|average basket|\baov\b|average spend/i, 'average order value'],
      trace: t('reads.aovTrace'),
      answer: () => {
        const s = daySummary(ctx.state, today());
        const week = lastDays(7).map((k) => daySummary(ctx.state, k));
        const wOrders = week.reduce((t2, d) => t2 + d.billable, 0);
        const wGross = week.reduce((t2, d) => t2 + d.gross, 0);
        const wAov = wOrders ? Math.round(wGross / wOrders) : 0;
        return {
          text: t('reads.aovText', {
            today: M(s.aov),
            billable: num(s.billable),
            week: M(wAov),
            dir: s.aov >= wAov ? t('reads.above') : t('reads.below'),
            discount: M(s.discount),
          }),
          suggestions: [t('ask.bestSellers'), t('ask.costliestCode'), t('ask.rush')],
        };
      },
    },
    {
      id: 'queue',
      match: [/open orders|queue|board|waiting|preparing|how busy|backlog|pending/i, 'open orders'],
      trace: t('reads.queueTrace'),
      answer: () => {
        const live = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed');
        if (!live.length) return { text: t('reads.queueNone') };
        const value = live.reduce((t2, o) => t2 + o.total, 0);
        const oldest = live.slice().sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt))[0];
        const late = live.filter((o) => (Date.now() - new Date(o.placedAt).getTime()) / 60000 > ctx.state.settings.prepMinutes);
        return {
          text: t('reads.queueText', {
            n: num(live.length),
            value: M(value),
            no: oldest.no,
            customer: oldest.customer,
            ago: ago(oldest.placedAt),
            late: late.length
              ? t('reads.queueLate', { n: num(late.length), prep: num(ctx.state.settings.prepMinutes) })
              : '',
          }),
          table: {
            head: [t('reads.columnRow'), t('reads.ordersRow'), t('reads.valueRow')],
            rows: STATUSES.map((s) => {
              const inCol = ctx.state.orders.filter((o) => o.status === s && dayKey(o.placedAt) === today());
              return [STEP_LABEL(s), num(inCol.length), M(inCol.reduce((t2, o) => t2 + o.total, 0))];
            }),
          },
          suggestions: [t('ask.whereOrderFixed'), t('ask.revenue'), t('ask.lowStock')],
        };
      },
    },
    {
      id: 'discounts',
      match: [/discount|coupon|promo|code|offer/i, 'discount codes'],
      trace: t('reads.codesTrace'),
      answer: () => {
        const days = lastDays(7);
        const rows = ctx.state.discounts.map((d) => {
          const used = ctx.state.orders.filter((o) => o.discountCode === d.code && o.status !== 'cancelled' && days.includes(dayKey(o.placedAt)));
          return {
            code: d.code,
            active: d.active,
            given: used.reduce((t2, o) => t2 + o.discountAmt, 0),
            orders: used.length,
            revenue: used.reduce((t2, o) => t2 + o.total, 0),
          };
        }).sort((a, b) => b.given - a.given);
        const given = rows.reduce((t2, r) => t2 + r.given, 0);
        const top = rows[0];
        return {
          text: t('reads.codesText', {
            n: num(ctx.state.discounts.filter((d) => d.active).length),
            given: M(given),
            top: top && top.given
              ? t('reads.codesTop', { code: top.code, money: M(top.given), orders: num(top.orders) })
              : '',
          }),
          table: {
            head: [t('common.code'), t('common.state'), t('reads.ordersRow'), t('reads.givenRow')],
            rows: rows.map((r) => [r.code, r.active ? t('reads.stateActive') : t('reads.statePaused'), num(r.orders), M(r.given)]),
          },
          suggestions: [t('ask.aov'), t('ask.revenue'), t('ask.week')],
        };
      },
    },
    {
      id: 'category',
      match: [/categor|section|which part of the menu|bakes|meals|drinks|snacks|grocery|sweets/i, 'by category'],
      trace: t('reads.catTrace'),
      answer: () => {
        const cats = revenueByCategory(ctx.state, today()).sort((a, b) => b.value - a.value);
        const total = cats.reduce((t2, c) => t2 + c.value, 0);
        if (!total) return { text: t('reads.catNone') };
        return {
          text: t('reads.catText', {
            name: cats[0].label, money: M(cats[0].value), share: pct((cats[0].value / total) * 100, 0),
          }),
          table: {
            head: [t('common.category'), t('common.revenue'), t('reads.shareRow')],
            rows: cats.map((c) => [c.label, M(c.value), pct(total ? (c.value / total) * 100 : 0, 0)]),
          },
          suggestions: [t('ask.bestSellers'), t('ask.lowStock'), t('ask.rush')],
        };
      },
    },
    {
      id: 'busiest',
      match: [/busiest|peak|rush|what time|which hour|quiet/i, 'busiest hour'],
      trace: t('reads.hourTrace'),
      answer: () => {
        const hours = revenueByHour(ctx.state, today()).filter((b) => b.orders > 0);
        if (!hours.length) return { text: t('reads.hourNone') };
        const ranked = hours.slice().sort((a, b) => b.value - a.value);
        const peak = ranked[0];
        return {
          text: t('reads.hourText', {
            from: peak.label,
            to: String(Number(peak.label) + 1).padStart(2, '0'),
            orders: num(peak.orders),
            money: M(peak.value),
            quiet: ranked[ranked.length - 1].label,
          }),
          table: {
            head: [t('reads.hourRow'), t('reads.ordersRow'), t('common.revenue')],
            rows: ranked.slice(0, 5).map((b) => [`${b.label}:00`, num(b.orders), M(b.value)]),
          },
          suggestions: [t('ask.openOrders'), t('ask.revenue'), t('ask.bestSellers')],
        };
      },
    },
    {
      id: 'week',
      match: [/this week|last 7|seven days|trend|compare|yesterday|week/i, 'this week'],
      trace: t('reads.weekTrace'),
      answer: () => {
        const days = lastDays(7).slice().reverse();
        const rows = days.map((k) => ({ k, s: daySummary(ctx.state, k) }));
        const gross = rows.reduce((t2, r) => t2 + r.s.gross, 0);
        const best = rows.slice().sort((a, b) => b.s.gross - a.s.gross)[0];
        return {
          text: t('reads.weekText', {
            gross: M(gross),
            orders: num(rows.reduce((t2, r) => t2 + r.s.orders, 0)),
            day: dayLabel(best.k).toLowerCase(),
            best: M(best.s.gross),
          }),
          table: {
            head: [t('reads.dayRow'), t('reads.ordersRow'), t('reads.grossRow'), t('reads.netRow')],
            rows: rows.map((r) => [dayLabel(r.k), num(r.s.orders), M(r.s.gross), M(r.s.net)]),
          },
          suggestions: [t('ask.aov'), t('ask.whyRefunds'), t('ask.category')],
        };
      },
    },
    {
      id: 'stock-value',
      match: [/stock value|inventory|how much stock|worth of stock|holding/i, 'stock', 'stock value'],
      trace: t('reads.stockTrace'),
      answer: () => {
        const ps = ctx.state.products;
        const cost = ps.reduce((t2, p) => t2 + p.stock * p.cost, 0);
        const retail = ps.reduce((t2, p) => t2 + p.stock * p.price, 0);
        const deepest = ps.slice().sort((a, b) => b.stock * b.cost - a.stock * a.cost).slice(0, 5);
        return {
          text: t('reads.stockText', {
            cost: M(cost),
            retail: M(retail),
            n: num(ps.length),
            margin: pct(retail ? ((retail - cost) / retail) * 100 : 0, 1),
          }),
          table: {
            head: [t('common.product'), t('common.stock'), t('reads.atCostRow')],
            rows: deepest.map((p) => [p.name, String(p.stock), M(p.stock * p.cost)]),
          },
          suggestions: [t('ask.lowStock'), t('ask.category'), t('ask.bestSellers')],
        };
      },
    },
    {
      id: 'customers',
      match: [/customer|who ordered|who bought|who spends|spends the most|top spender|biggest spender|repeat|regular/i, 'customers'],
      trace: t('reads.custTrace'),
      answer: () => {
        const days = lastDays(7);
        const map = new Map();
        ctx.state.orders.filter((o) => o.status !== 'cancelled' && days.includes(dayKey(o.placedAt))).forEach((o) => {
          const cur2 = map.get(o.customer) || { orders: 0, spend: 0 };
          cur2.orders += 1;
          cur2.spend += o.total;
          map.set(o.customer, cur2);
        });
        const ranked = [...map.entries()].sort((a, b) => b[1].spend - a[1].spend).slice(0, 6);
        if (!ranked.length) return { text: t('reads.custNone') };
        const repeat = [...map.values()].filter((v) => v.orders > 1).length;
        return {
          text: t('reads.custText', {
            names: num(map.size), repeat: num(repeat), top: ranked[0][0], spend: M(ranked[0][1].spend),
          }),
          table: {
            head: [t('common.customer'), t('reads.ordersRow'), t('reads.spendRow')],
            rows: ranked.map(([n, v]) => [n, num(v.orders), M(v.spend)]),
          },
          suggestions: [t('ask.aov'), t('ask.openOrders'), t('ask.week')],
        };
      },
    },
    {
      id: 'today-shape',
      match: [/how is today|day so far|summary|how are we doing|overview/i, 'today'],
      trace: t('reads.todayTrace'),
      answer: () => {
        const s = daySummary(ctx.state, today());
        const items = topItems(ctx.state, today(), 1);
        const live = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed').length;
        return {
          text: t('reads.todayText', {
            orders: num(s.orders),
            gross: M(s.gross),
            net: M(s.net),
            aov: M(s.aov),
            items: num(s.items),
            star: items.length ? t('reads.todayStar', { name: items[0].name }) : '',
            live: live ? t('reads.todayLive', { n: num(live) }) : t('reads.todayClear'),
          }),
          suggestions: [t('ask.lowStock'), t('ask.rush'), t('ask.openOrders')],
        };
      },
    },
    {
      id: 'help',
      match: [/what can you|what do you do|help|how do you work|capabilit|what are you able/i, 'what can you do'],
      trace: t('reads.helpTrace'),
      answer: () => {
        const s = daySummary(ctx.state, today());
        return {
          text: t('reads.helpText', { orders: num(s.orders), gross: M(s.gross) }),
          table: {
            head: [t('reads.helpAskRow'), t('reads.helpDoesRow')],
            rows: ACTION_EXAMPLES().map((e) => [`**${e.ask}**`, e.reply]),
          },
          meta: t('reads.helpMeta', {
            actions: num(ACTION_EXAMPLES().length),
            readers: num(reads.length),
            orders: num(ctx.state.orders.length),
            products: num(ctx.state.products.length),
            codes: num(ctx.state.discounts.length),
          }),
          suggestions: [t('ask.restock'), t('ask.move'), t('ask.whatQuestions'), t('ask.revenue')],
        };
      },
    },
    {
      id: 'help-read',
      match: [/what (?:questions|else) can|what do you know|what can you tell/i],
      trace: t('reads.helpReadTrace'),
      answer: () => ({
        text: t('reads.helpReadText'),
        table: { head: [t('reads.helpAskRow'), t('reads.helpReadRow')], rows: READ_EXAMPLES().map((e) => [`**${e.ask}**`, e.reply]) },
        suggestions: [t('ask.revenue'), t('ask.bestSellers'), t('ask.lowStock'), t('ask.whatCanYouDo')],
      }),
    },
  ];

  /* Instructions first, questions second. */
  const intents = [...actionIntents(ctx), ...reads];

  /* The phrases a Gulf reader would actually type live in the Arabic half of
     the dictionary, keyed by intent id. They are appended to what each intent
     already matches on, never substituted — `match.<id>` is an empty list in
     the English half, so English routing is byte-for-byte what it was. */
  intents.forEach((it) => {
    const extra = tlist(`match.${it.id}`);
    if (extra.length) it.match = [].concat(it.match || [], extra.map((s) => new RegExp(s, 'i')));
  });

  const bot = new Assistant({
    name: t('agent.name'),
    initials: t('agent.initials'),
    tag: t('agent.tag'),
    greeting: t('agent.greeting'),
    suggestions: tlist('agent.suggestions'),
    intents,
    fallbacks: tlist('agent.fallbacks'),
    note: t('agent.note'),
    /* The panel's own chrome, in the language the page is reading. */
    labels: {
      openAria: (name) => t('agent.chrome.openAria', { name }),
      fabTitle: (name) => t('agent.chrome.fabTitle', { name }),
      reset: t('agent.chrome.reset'),
      close: t('agent.chrome.close'),
      ask: t('agent.chrome.ask'),
      send: t('agent.chrome.send'),
      you: t('agent.chrome.you'),
      working: t('agent.chrome.working'),
      edge: t('agent.chrome.edge'),
      failed: t('agent.chrome.failed'),
      done: t('agent.chrome.done'),
      appliedMeta: t('agent.chrome.appliedMeta'),
      searchTrace: t('agent.chrome.searchTrace'),
    },
    context: () => ({
      day: today(),
      summary: daySummary(ctx.state, today()),
      orders: ctx.state.orders.length,
      lowStock: lowStock(ctx.state).length,
    }),
  });

  return bot;
}

function soldToday(ctx, productId) {
  return ordersOn(ctx.state, dayKey(new Date()))
    .filter((o) => o.status !== 'cancelled')
    .reduce((t2, o) => t2 + o.items.filter((it) => it.productId === productId).reduce((n, it) => n + it.qty, 0), 0);
}

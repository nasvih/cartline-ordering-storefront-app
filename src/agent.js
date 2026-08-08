/* ============================================================
   Cartline Assist — the in-app agent.
   Every answer is assembled here from the live store: place an order,
   refund one, restock a product, and the replies change with it.
   There is no model and no network call anywhere in this file.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { money, num, pct, ago } from '../lib/ui.js';
import {
  dayKey, dayLabel, lastDays, daySummary, topItems, revenueByHour, revenueByCategory,
  ordersOn, lowStock, orderByNo, STATUSES,
} from './data.js';

const STEP_LABEL = { new: 'new', preparing: 'preparing', ready: 'ready', completed: 'completed', refunded: 'refunded', cancelled: 'cancelled' };

export function buildAgent(ctx) {
  const cur = () => ctx.state.settings.currency;
  const today = () => dayKey(new Date());
  const M = (n) => money(n, cur());

  const intents = [
    {
      id: 'revenue-today',
      match: [/revenue|takings|sales|turnover|how much.*(made|sold)|money/i, 'revenue today'],
      trace: 'summed every order line placed today',
      answer: () => {
        const s = daySummary(ctx.state, today());
        const y = daySummary(ctx.state, lastDays(2)[1]);
        const diff = y.gross ? Math.round(((s.gross - y.gross) / y.gross) * 100) : 0;
        return {
          text: `Today is at **${M(s.gross)}** gross across ${num(s.orders)} orders, **${M(s.net)}** net once ${M(s.refunds)} of refunds come off.\n\nYesterday finished at ${M(y.gross)}, so today is ${diff >= 0 ? 'up' : 'down'} ${Math.abs(diff)}% so far.`,
          table: {
            head: ['Measure', 'Today', 'Yesterday'],
            rows: [
              ['Orders', num(s.orders), num(y.orders)],
              ['Gross', M(s.gross), M(y.gross)],
              ['Refunds', M(s.refunds), M(y.refunds)],
              ['Net', M(s.net), M(y.net)],
              ['Average order', M(s.aov), M(y.aov)],
            ],
          },
          suggestions: ['What sold best today?', 'What is low on stock?', 'How does this week look?'],
        };
      },
    },
    {
      id: 'best-sellers',
      match: [/sold best|best sell|bestsell|top item|top sell|most sold|popular|what.*sold/i, 'best sellers'],
      trace: 'grouped today\'s order lines by product',
      answer: () => {
        const items = topItems(ctx.state, today(), 5);
        if (!items.length) return { text: 'Nothing has sold yet today. Place an order on the storefront and ask again.' };
        const lead = items[0];
        return {
          text: `**${lead.name}** leads today with ${num(lead.qty)} sold, worth ${M(lead.revenue)}. Here is the rest of the top five.`,
          table: {
            head: ['Item', 'Sold', 'Revenue'],
            rows: items.map((it) => [it.name, num(it.qty), M(it.revenue)]),
          },
          suggestions: ['Which category earns most?', 'What is low on stock?', 'What is the average order value?'],
        };
      },
    },
    {
      id: 'low-stock',
      match: [/\blow\b.{0,4}stock|running out|restock|reorder|out of stock|stock level|need.*reorder/i, 'low stock'],
      trace: 'checked every listed product against the low-stock threshold',
      answer: () => {
        const low = lowStock(ctx.state);
        const limit = ctx.state.settings.lowStockAt;
        if (!low.length) return { text: `Nothing is at or below ${num(limit)} units. The catalogue is comfortable.` };
        const zero = low.filter((p) => p.stock === 0);
        const cost = low.reduce((t, p) => t + (20 - p.stock) * p.cost, 0);
        return {
          text: `${num(low.length)} products are at or below ${num(limit)} units${zero.length ? `, and ${num(zero.length)} are already at zero` : ''}. Topping each of them back to 20 units costs about **${M(cost)}** at cost price.`,
          table: {
            head: ['Product', 'Stock', 'Sold today'],
            rows: low.slice(0, 8).map((p) => [p.name, String(p.stock), num(soldToday(ctx, p.id))]),
          },
          suggestions: ['What sold best today?', 'How much stock do we hold?', 'Show the open orders'],
        };
      },
    },
    {
      id: 'order-status',
      match: [/\bCL[- ]?\d+/i, /order\s+#?\d{3,}/i, /where is (my )?order|order status|track|order number|order by number|look ?up an order|find an order/i],
      trace: 'looked the order up by number',
      answer: (q) => {
        const m = q.match(/\d{3,}/);
        if (!m) {
          const last = ctx.state.orders[0];
          return { text: `Give me a number and I will pull it up — the newest order on the board is **${last.no}** for ${last.customer}, currently ${STEP_LABEL[last.status]}.` };
        }
        const o = orderByNo(ctx.state, m[0]);
        if (!o) return { text: `I have no order numbered ${m[0]}. Numbers in this demo run from CL-1042 upwards.` };
        const line = o.status === 'refunded'
          ? `It was refunded ${M(o.refund.amount)} — ${o.refund.reason.toLowerCase()}.`
          : o.status === 'cancelled'
            ? 'It was cancelled before the kitchen started it.'
            : `It sits at **${STEP_LABEL[o.status]}** and was last touched ${ago(o.updatedAt)}.`;
        return {
          text: `**${o.no}** for ${o.customer}, ${o.channel.toLowerCase()}, ${M(o.total)} paid by ${o.payment}. ${line}`,
          table: {
            head: ['Item', 'Qty', 'Line'],
            rows: o.items.map((it) => [it.name, String(it.qty), M(it.price * it.qty)]),
          },
          meta: `read order ${o.no} and its ${o.timeline.length} timeline entries`,
          suggestions: ['Why do orders get refunded?', 'Show the open orders', 'What is today\'s revenue?'],
        };
      },
    },
    {
      id: 'refunds',
      match: [/refund|money back|charge ?back|returned/i, 'refunds'],
      trace: 'read every refund record from the last seven days',
      answer: () => {
        const days = lastDays(7);
        const refs = ctx.state.orders.filter((o) => o.status === 'refunded' && days.includes(dayKey(o.placedAt)));
        if (!refs.length) return { text: 'No refunds in the last seven days.' };
        const total = refs.reduce((t, o) => t + (o.refund ? o.refund.amount : o.total), 0);
        const byReason = new Map();
        refs.forEach((o) => {
          const r = o.refund ? o.refund.reason : 'Not recorded';
          byReason.set(r, (byReason.get(r) || 0) + 1);
        });
        const ranked = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
        return {
          text: `${num(refs.length)} refunds in seven days, **${M(total)}** in total. The most common reason is "${ranked[0][0].toLowerCase()}".`,
          table: {
            head: ['Reason', 'Orders'],
            rows: ranked.map(([r, n]) => [r, num(n)]),
          },
          suggestions: ['What is today\'s revenue?', 'Show the open orders', 'Which category earns most?'],
        };
      },
    },
    {
      id: 'aov',
      match: [/average order|basket size|average basket|\baov\b|average spend/i, 'average order value'],
      trace: 'divided billable revenue by billable orders',
      answer: () => {
        const s = daySummary(ctx.state, today());
        const week = lastDays(7).map((k) => daySummary(ctx.state, k));
        const wOrders = week.reduce((t, d) => t + d.billable, 0);
        const wGross = week.reduce((t, d) => t + d.gross, 0);
        const wAov = wOrders ? Math.round(wGross / wOrders) : 0;
        return {
          text: `Average order value today is **${M(s.aov)}** over ${num(s.billable)} billable orders. Across the last seven days it is ${M(wAov)}, so today runs ${s.aov >= wAov ? 'above' : 'below'} the recent line.\n\nDiscount codes took ${M(s.discount)} off today's baskets.`,
          suggestions: ['What sold best today?', 'Which discount code costs most?', 'When is the rush?'],
        };
      },
    },
    {
      id: 'queue',
      match: [/open orders|queue|board|waiting|preparing|how busy|backlog|pending/i, 'open orders'],
      trace: 'scanned the live board columns',
      answer: () => {
        const live = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed');
        if (!live.length) return { text: 'The board is clear — nothing is waiting on the kitchen right now.' };
        const value = live.reduce((t, o) => t + o.total, 0);
        const oldest = live.slice().sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt))[0];
        const late = live.filter((o) => (Date.now() - new Date(o.placedAt).getTime()) / 60000 > ctx.state.settings.prepMinutes);
        return {
          text: `${num(live.length)} orders are open, worth **${M(value)}**. The oldest is ${oldest.no} for ${oldest.customer}, placed ${ago(oldest.placedAt)}.${late.length ? ` ${num(late.length)} are past the ${num(ctx.state.settings.prepMinutes)} minute promise.` : ''}`,
          table: {
            head: ['Column', 'Orders', 'Value'],
            rows: STATUSES.map((s) => {
              const inCol = ctx.state.orders.filter((o) => o.status === s && dayKey(o.placedAt) === today());
              return [s, num(inCol.length), M(inCol.reduce((t, o) => t + o.total, 0))];
            }),
          },
          suggestions: ['Where is order CL-1052?', 'What is today\'s revenue?', 'What is low on stock?'],
        };
      },
    },
    {
      id: 'discounts',
      match: [/discount|coupon|promo|code|offer/i, 'discount codes'],
      trace: 'joined the code list against seven days of orders',
      answer: () => {
        const days = lastDays(7);
        const rows = ctx.state.discounts.map((d) => {
          const used = ctx.state.orders.filter((o) => o.discountCode === d.code && o.status !== 'cancelled' && days.includes(dayKey(o.placedAt)));
          return {
            code: d.code,
            active: d.active,
            given: used.reduce((t, o) => t + o.discountAmt, 0),
            orders: used.length,
            revenue: used.reduce((t, o) => t + o.total, 0),
          };
        }).sort((a, b) => b.given - a.given);
        const given = rows.reduce((t, r) => t + r.given, 0);
        const top = rows[0];
        return {
          text: `${num(ctx.state.discounts.filter((d) => d.active).length)} codes are active and they gave away **${M(given)}** in seven days.${top && top.given ? ` ${top.code} is the costliest at ${M(top.given)} across ${num(top.orders)} orders.` : ''}`,
          table: {
            head: ['Code', 'State', 'Orders', 'Given'],
            rows: rows.map((r) => [r.code, r.active ? 'active' : 'paused', num(r.orders), M(r.given)]),
          },
          suggestions: ['What is the average order value?', 'What is today\'s revenue?', 'How does this week look?'],
        };
      },
    },
    {
      id: 'category',
      match: [/categor|section|which part of the menu|bakes|meals|drinks|snacks|grocery|sweets/i, 'by category'],
      trace: 'grouped today\'s lines by category',
      answer: () => {
        const cats = revenueByCategory(ctx.state, today()).sort((a, b) => b.value - a.value);
        const total = cats.reduce((t, c) => t + c.value, 0);
        if (!total) return { text: 'No category has taken anything yet today.' };
        return {
          text: `**${cats[0].label}** is ahead today with ${M(cats[0].value)}, ${pct((cats[0].value / total) * 100, 0)} of the counter.`,
          table: {
            head: ['Category', 'Revenue', 'Share'],
            rows: cats.map((c) => [c.label, M(c.value), pct(total ? (c.value / total) * 100 : 0, 0)]),
          },
          suggestions: ['What sold best today?', 'What is low on stock?', 'When is the rush?'],
        };
      },
    },
    {
      id: 'busiest',
      match: [/busiest|peak|rush|what time|which hour|quiet/i, 'busiest hour'],
      trace: 'bucketed today\'s orders into trading hours',
      answer: () => {
        const hours = revenueByHour(ctx.state, today()).filter((b) => b.orders > 0);
        if (!hours.length) return { text: 'No orders yet today, so there is no rush to point at.' };
        const ranked = hours.slice().sort((a, b) => b.value - a.value);
        const peak = ranked[0];
        return {
          text: `The rush today is **${peak.label}:00 to ${String(Number(peak.label) + 1).padStart(2, '0')}:00** — ${num(peak.orders)} orders worth ${M(peak.value)}. Quietest trading hour so far is ${ranked[ranked.length - 1].label}:00.`,
          table: {
            head: ['Hour', 'Orders', 'Revenue'],
            rows: ranked.slice(0, 5).map((b) => [`${b.label}:00`, num(b.orders), M(b.value)]),
          },
          suggestions: ['Show the open orders', 'What is today\'s revenue?', 'What sold best today?'],
        };
      },
    },
    {
      id: 'week',
      match: [/this week|last 7|seven days|trend|compare|yesterday|week/i, 'this week'],
      trace: 'read seven day summaries end to end',
      answer: () => {
        const days = lastDays(7).slice().reverse();
        const rows = days.map((k) => ({ k, s: daySummary(ctx.state, k) }));
        const gross = rows.reduce((t, r) => t + r.s.gross, 0);
        const best = rows.slice().sort((a, b) => b.s.gross - a.s.gross)[0];
        return {
          text: `Seven days come to **${M(gross)}** gross across ${num(rows.reduce((t, r) => t + r.s.orders, 0))} orders. The strongest day is ${dayLabel(best.k).toLowerCase()} at ${M(best.s.gross)}.`,
          table: {
            head: ['Day', 'Orders', 'Gross', 'Net'],
            rows: rows.map((r) => [dayLabel(r.k), num(r.s.orders), M(r.s.gross), M(r.s.net)]),
          },
          suggestions: ['What is the average order value?', 'Why do orders get refunded?', 'Which category earns most?'],
        };
      },
    },
    {
      id: 'stock-value',
      match: [/stock value|inventory|how much stock|worth of stock|holding/i, 'stock', 'stock value'],
      trace: 'valued every product line at cost and at retail',
      answer: () => {
        const ps = ctx.state.products;
        const cost = ps.reduce((t, p) => t + p.stock * p.cost, 0);
        const retail = ps.reduce((t, p) => t + p.stock * p.price, 0);
        const deepest = ps.slice().sort((a, b) => b.stock * b.cost - a.stock * a.cost).slice(0, 5);
        return {
          text: `The catalogue holds **${M(cost)}** at cost, ${M(retail)} at shelf price across ${num(ps.length)} products. That is a paper margin of ${pct(retail ? ((retail - cost) / retail) * 100 : 0, 1)}.`,
          table: {
            head: ['Product', 'Stock', 'At cost'],
            rows: deepest.map((p) => [p.name, String(p.stock), M(p.stock * p.cost)]),
          },
          suggestions: ['What is low on stock?', 'Which category earns most?', 'What sold best today?'],
        };
      },
    },
    {
      id: 'customers',
      match: [/customer|who ordered|who bought|who spends|spends the most|top spender|biggest spender|repeat|regular/i, 'customers'],
      trace: 'grouped seven days of orders by name on the ticket',
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
        if (!ranked.length) return { text: 'No customer records in the last seven days.' };
        const repeat = [...map.values()].filter((v) => v.orders > 1).length;
        return {
          text: `${num(map.size)} names bought something in seven days and ${num(repeat)} of them came back more than once. **${ranked[0][0]}** spent the most at ${M(ranked[0][1].spend)}.`,
          table: {
            head: ['Customer', 'Orders', 'Spend'],
            rows: ranked.map(([n, v]) => [n, num(v.orders), M(v.spend)]),
          },
          suggestions: ['What is the average order value?', 'Show the open orders', 'How does this week look?'],
        };
      },
    },
    {
      id: 'today-shape',
      match: [/how is today|day so far|summary|how are we doing|overview/i, 'today'],
      trace: 'pulled the day summary the operations screen uses',
      answer: () => {
        const s = daySummary(ctx.state, today());
        const items = topItems(ctx.state, today(), 1);
        const live = ctx.state.orders.filter((o) => STATUSES.includes(o.status) && o.status !== 'completed').length;
        return {
          text: `${num(s.orders)} orders so far, ${M(s.gross)} gross and ${M(s.net)} net. Average basket ${M(s.aov)}, ${num(s.items)} items out of the door.${items.length ? ` ${items[0].name} is the item of the day.` : ''}\n\n${live ? `${num(live)} orders are still open on the board.` : 'The board is clear.'}`,
          suggestions: ['What is low on stock?', 'When is the rush?', 'Show the open orders'],
        };
      },
    },
    {
      id: 'help',
      match: [/what can you|help|how do you work|capabilit/i, 'help'],
      trace: 'listed the intents this build ships with',
      answer: () => ({
        text: 'I read the same store data the screens do. Things I answer well:\n\n- Today\'s revenue, net after refunds, and the comparison with yesterday\n- Best sellers and revenue by category\n- What is low on stock and what a top-up would cost\n- The status of any order by number, for example CL-1052\n- Refund counts and the reasons behind them\n- Average order value, the busiest hour, the week so far\n- Discount code usage and what each code gave away\n- Stock value at cost and at shelf price',
        suggestions: ['What is today\'s revenue?', 'What sold best today?', 'What is low on stock?', 'Where is order CL-1052?'],
      }),
    },
  ];

  const bot = new Assistant({
    name: 'Cartline Assist',
    initials: 'CA',
    tag: 'Store agent · demo',
    greeting: `I read this store's live data. Ask about today's takings, what is selling, what is running out, or an order by its number.`,
    suggestions: ['What is today\'s revenue?', 'What sold best today?', 'What is low on stock?', 'Show the open orders'],
    intents,
    fallbacks: [
      'I could not match that to anything in the store data. Try "what is today\'s revenue" and I will pull the day summary.',
      'That one is outside what this build answers. Try "what is low on stock" or "where is order CL-1052".',
      'No intent for that yet. I do answer "what sold best today", "show the open orders" and "how does this week look".',
      'I only answer from this store\'s own records. Try "which discount code costs most" or "which category earns most".',
    ],
    note: 'Simulated agent — answers are matched against this app\'s own demo data in your browser. No request leaves this device.',
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
    .reduce((t, o) => t + o.items.filter((it) => it.productId === productId).reduce((n, it) => n + it.qty, 0), 0);
}

/* ============================================================
   Cartline — demo dataset.
   Everything below is invented sample data generated from a seeded
   pseudo-random function so the numbers stay stable between reloads.
   Nothing here talks to a network.
   ============================================================ */

import { seeded, between, pick } from '../lib/ui.js';

export const STORAGE_KEY = 'cartline.state.v1';

/* ---------- reference data ---------- */

export const CATEGORIES = [
  { id: 'bakes', name: 'Bakes', tone: 1 },
  { id: 'meals', name: 'Meals', tone: 2 },
  { id: 'drinks', name: 'Drinks', tone: 3 },
  { id: 'snacks', name: 'Snacks', tone: 4 },
  { id: 'grocery', name: 'Grocery', tone: 5 },
  { id: 'sweets', name: 'Sweets', tone: 6 },
];

export const CHANNELS = ['Counter', 'Pickup', 'Delivery'];
export const STATUSES = ['new', 'preparing', 'ready', 'completed'];
export const CLOSED_STATUSES = ['cancelled', 'refunded'];

export const REFUND_REASONS = [
  'Item out of stock after the order was placed',
  'Customer cancelled after payment',
  'Wrong item packed',
  'Delivery ran past the promised time',
  'Quality complaint raised at the counter',
];

const PRODUCTS = [
  ['Malabar Bun', 'bakes', 35, 'Soft sweet bun baked twice a day.'],
  ['Butter Croissant', 'bakes', 90, 'Laminated overnight, baked at 06:30.'],
  ['Coconut Loaf', 'bakes', 140, 'Half kilo loaf with fresh coconut.'],
  ['Date Roll', 'bakes', 60, 'Dates and cashew rolled in wheat pastry.'],
  ['Wheat Rusk 200g', 'bakes', 75, 'Twice baked, keeps for two weeks.'],
  ['Chicken Biryani', 'meals', 220, 'Kaima rice, served with raita and pickle.'],
  ['Veg Meals Box', 'meals', 150, 'Rice, three sides, sambar and pappadam.'],
  ['Kuboos Wrap', 'meals', 120, 'Grilled chicken, garlic sauce, salad.'],
  ['Fish Curry Meal', 'meals', 240, 'Day catch in a coconut and kudampuli curry.'],
  ['Paneer Rice Bowl', 'meals', 190, 'Tossed paneer over ghee rice.'],
  ['Sulaimani Tea', 'drinks', 25, 'Black tea, lemon, a little cardamom.'],
  ['Filter Coffee', 'drinks', 40, 'Decoction pulled to order.'],
  ['Lime Mint Cooler', 'drinks', 70, 'Fresh lime, mint, no syrup.'],
  ['Mango Lassi', 'drinks', 90, 'Thick curd and alphonso pulp.'],
  ['Karak Chai', 'drinks', 35, 'Boiled long with evaporated milk.'],
  ['Banana Chips 200g', 'snacks', 110, 'Fried in coconut oil, salted lightly.'],
  ['Kerala Mixture 250g', 'snacks', 95, 'House mix, medium heat.'],
  ['Samosa (2 pcs)', 'snacks', 50, 'Potato and green pea filling.'],
  ['Chicken Puff', 'snacks', 45, 'Flaky pastry, pepper heavy.'],
  ['Masala Peanuts', 'snacks', 60, 'Roasted, curry leaf and chilli.'],
  ['Matta Rice 5kg', 'grocery', 420, 'Red parboiled rice, Palakkad milled.'],
  ['Coconut Oil 1L', 'grocery', 280, 'Cold pressed, unrefined.'],
  ['Coffee Powder 500g', 'grocery', 340, 'Eighty twenty coffee chicory blend.'],
  ['Toor Dal 1kg', 'grocery', 165, 'Unpolished, cleaned twice.'],
  ['Payasam Cup', 'sweets', 80, 'Ada pradhaman in a sealed cup.'],
  ['Date Pudding', 'sweets', 120, 'Steamed date sponge with caramel.'],
  ['Tender Coconut Souffle', 'sweets', 130, 'Set with tender coconut water.'],
];

const CUSTOMERS = [
  'Anjali Menon', 'Rahul Varghese', 'Fatima Al-Harbi', 'Sameer Qureshi',
  'Nithya Balan', 'Ibrahim Al-Otaibi', 'Deepa Krishnan', 'Yousuf Rahman',
  'Meera Nair', 'Arun Pillai', 'Haseena Beevi', 'Tariq Al-Zahrani',
  'Lakshmi Iyer', 'Noufal Shereef', 'Sandra Jacob', 'Vivek Menon',
  'Reshma Thomas', 'Abdul Basith', 'Priya Raghavan', 'Jomon Cherian',
];

const AREAS = ['Panampilly Nagar', 'Kaloor', 'Edappally', 'Fort Kochi', 'Vyttila', 'Thevara'];

const STAFF = ['Sreejith', 'Anas', 'Divya', 'Rukhiya'];

/* ---------- date helpers (local day, not UTC) ---------- */

export function dayKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function startOfDay(d) {
  const dt = new Date(d instanceof Date ? d.getTime() : new Date(d).getTime());
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function dayLabel(key) {
  const today = dayKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === dayKey(y)) return 'Yesterday';
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

/* ---------- money ---------- */

export function lineTotal(it) { return it.price * it.qty; }

export function priceCart(items, settings, discount) {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  let discountAmt = 0;
  if (discount && discount.active && subtotal >= (discount.minOrder || 0)) {
    discountAmt = discount.kind === 'pct'
      ? Math.round((subtotal * discount.value) / 100)
      : Math.min(discount.value, subtotal);
  }
  const taxable = Math.max(0, subtotal - discountAmt);
  const tax = Math.round((taxable * (settings.taxPct || 0)) / 100);
  const delivery = 0;
  return { subtotal, discountAmt, tax, delivery, total: taxable + tax + delivery };
}

/* ---------- seed ---------- */

function seedProducts(rnd) {
  return PRODUCTS.map((p, i) => {
    const [name, category, price, description] = p;
    const cat = CATEGORIES.find((c) => c.id === category);
    const stock = i % 9 === 3 ? between(0, 4, rnd) : between(6, 60, rnd);
    return {
      id: `P${String(i + 1).padStart(3, '0')}`,
      sku: `${category.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      name,
      category,
      tone: cat ? cat.tone : 1,
      price,
      cost: Math.round(price * (0.48 + rnd() * 0.16)),
      stock,
      description,
      active: true,
      prepMins: category === 'meals' ? 14 : category === 'drinks' ? 4 : 6,
    };
  });
}

function seedDiscounts() {
  return [
    { code: 'FIRST50', kind: 'flat', value: 50, minOrder: 300, active: true, uses: 12, maxUses: 200, note: 'First order on the storefront' },
    { code: 'WEEKEND10', kind: 'pct', value: 10, minOrder: 500, active: true, uses: 31, maxUses: 400, note: 'Saturday and Sunday basket builder' },
    { code: 'COAST20', kind: 'pct', value: 20, minOrder: 900, active: true, uses: 7, maxUses: 60, note: 'Large pickup orders only' },
    { code: 'STAFF15', kind: 'pct', value: 15, minOrder: 0, active: false, uses: 44, maxUses: 0, note: 'Paused while the counter is short staffed' },
  ];
}

function makeOrder({ no, products, rnd, when, status, settings, discounts }) {
  const count = between(1, 4, rnd);
  const chosen = [];
  for (let i = 0; i < count; i += 1) {
    const p = pick(products, rnd);
    if (chosen.some((c) => c.productId === p.id)) continue;
    chosen.push({ productId: p.id, name: p.name, price: p.price, qty: between(1, 3, rnd), category: p.category });
  }
  if (!chosen.length) {
    const p = products[0];
    chosen.push({ productId: p.id, name: p.name, price: p.price, qty: 1, category: p.category });
  }
  const useCode = rnd() < 0.22;
  const code = useCode ? pick(discounts.filter((d) => d.active), rnd) : null;
  const totals = priceCart(chosen, settings, code);
  const channel = pick(CHANNELS, rnd);
  const placedAt = when.toISOString();
  const order = {
    id: `O${no}`,
    no: `CL-${no}`,
    customer: pick(CUSTOMERS, rnd),
    channel,
    area: channel === 'Delivery' ? pick(AREAS, rnd) : '',
    note: rnd() < 0.18 ? pick(['Less spice please', 'Pack the curry separately', 'Call on arrival', 'No pappadam'], rnd) : '',
    items: chosen,
    ...totals,
    discountCode: totals.discountAmt > 0 && code ? code.code : '',
    payment: pick(['UPI', 'Card', 'Cash'], rnd),
    status,
    placedAt,
    updatedAt: placedAt,
    handledBy: pick(STAFF, rnd),
    refund: null,
    timeline: [{ at: placedAt, label: 'Order placed', by: channel === 'Counter' ? 'Counter' : 'Storefront' }],
  };
  return order;
}

function advanceTimeline(order, rnd) {
  const steps = { preparing: 'Moved to preparing', ready: 'Marked ready', completed: 'Handed over' };
  const order_ = order;
  let t = new Date(order.placedAt).getTime();
  const reached = STATUSES.slice(1, STATUSES.indexOf(order.status) + 1);
  reached.forEach((s) => {
    t = Math.min(t + between(3, 16, rnd) * 60000, Date.now() - 30000);
    order_.timeline.push({ at: new Date(t).toISOString(), label: steps[s], by: order.handledBy });
  });
  order_.updatedAt = new Date(t).toISOString();
  return order_;
}

export function seedState() {
  const rnd = seeded(20260808);
  const settings = {
    storeName: 'Malabar Pantry',
    tagline: 'Bakery, kitchen and provisions — Kochi',
    currency: '₹',
    taxPct: 5,
    lowStockAt: 8,
    prepMinutes: 18,
    acceptingOrders: true,
    counterName: 'Counter 1',
  };
  const products = seedProducts(rnd);
  const discounts = seedDiscounts();
  const orders = [];
  let no = 1041;

  /* six closed days behind us, then today */
  for (let back = 6; back >= 1; back -= 1) {
    const perDay = between(9, 16, rnd);
    for (let i = 0; i < perDay; i += 1) {
      const when = new Date();
      when.setDate(when.getDate() - back);
      when.setHours(between(8, 20, rnd), between(0, 59, rnd), 0, 0);
      let status = 'completed';
      const roll = rnd();
      if (roll > 0.94) status = 'refunded';
      else if (roll > 0.90) status = 'cancelled';
      const o = makeOrder({ no: no += 1, products, rnd, when, status: 'completed', settings, discounts });
      if (status !== 'cancelled') advanceTimeline(o, rnd);
      if (status === 'refunded') {
        const at = new Date(new Date(o.updatedAt).getTime() + between(20, 200, rnd) * 60000).toISOString();
        o.status = 'refunded';
        o.refund = { amount: o.total, reason: pick(REFUND_REASONS, rnd), note: '', at, by: pick(STAFF, rnd) };
        o.timeline.push({ at, label: `Refunded ${settings.currency}${o.total}`, by: o.refund.by });
        o.updatedAt = at;
      } else if (status === 'cancelled') {
        const at = new Date(new Date(o.placedAt).getTime() + between(4, 25, rnd) * 60000).toISOString();
        o.status = 'cancelled';
        o.timeline.push({ at, label: 'Cancelled before preparing', by: o.handledBy });
        o.updatedAt = at;
      }
      orders.push(o);
    }
  }

  /* today — a live board with work in every column */
  const now = new Date();
  const todayPlan = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed',
    'preparing', 'preparing', 'ready', 'ready', 'new', 'new', 'new', 'refunded'];
  const AGE = { new: [2, 9], preparing: [10, 22], ready: [24, 44] };
  todayPlan.forEach((status, i) => {
    const when = new Date();
    if (AGE[status]) {
      when.setTime(now.getTime() - between(AGE[status][0], AGE[status][1], rnd) * 60000);
    } else {
      const spread = Math.max(1, now.getHours() - 8);
      const hour = Math.max(8, 8 + Math.floor((i / todayPlan.length) * spread));
      when.setHours(hour, between(0, 59, rnd), 0, 0);
      if (when.getTime() > now.getTime() - 45 * 60000) when.setTime(now.getTime() - between(50, 240, rnd) * 60000);
    }
    const base = status === 'refunded' ? 'completed' : status;
    const o = makeOrder({ no: no += 1, products, rnd, when, status: base, settings, discounts });
    advanceTimeline(o, rnd);
    if (status === 'refunded') {
      const at = new Date(new Date(o.updatedAt).getTime() + between(10, 60, rnd) * 60000).toISOString();
      o.status = 'refunded';
      o.refund = { amount: o.total, reason: REFUND_REASONS[2], note: 'Packed a veg box instead of the fish meal.', at, by: 'Divya' };
      o.timeline.push({ at, label: `Refunded ${settings.currency}${o.total}`, by: 'Divya' });
      o.updatedAt = at;
    }
    orders.push(o);
  });

  orders.sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));

  return {
    version: 1,
    settings,
    products,
    discounts,
    orders,
    cart: { items: [], code: '' },
    counter: no,
    lastOrderNo: '',
    face: 'shop',
  };
}

/* ---------- derived reads used by views and the assistant ---------- */

export const isLive = (o) => STATUSES.includes(o.status);
export const isRevenue = (o) => o.status !== 'cancelled';

export function ordersOn(state, key) {
  return state.orders.filter((o) => dayKey(o.placedAt) === key);
}

export function daySummary(state, key) {
  const list = ordersOn(state, key);
  const billable = list.filter((o) => o.status !== 'cancelled');
  const refunded = list.filter((o) => o.status === 'refunded');
  const gross = billable.reduce((s, o) => s + o.total, 0);
  const refundTotal = refunded.reduce((s, o) => s + (o.refund ? o.refund.amount : o.total), 0);
  const net = gross - refundTotal;
  const items = billable.reduce((s, o) => s + o.items.reduce((n, it) => n + it.qty, 0), 0);
  const discount = billable.reduce((s, o) => s + o.discountAmt, 0);
  return {
    key,
    orders: list.length,
    billable: billable.length,
    gross,
    refunds: refundTotal,
    refundCount: refunded.length,
    net,
    aov: billable.length ? Math.round(gross / billable.length) : 0,
    items,
    discount,
    cancelled: list.filter((o) => o.status === 'cancelled').length,
    list,
  };
}

export function topItems(state, key, limit = 6) {
  const map = new Map();
  ordersOn(state, key).filter(isRevenue).forEach((o) => {
    o.items.forEach((it) => {
      const cur = map.get(it.name) || { name: it.name, qty: 0, revenue: 0, category: it.category };
      cur.qty += it.qty;
      cur.revenue += it.price * it.qty;
      map.set(it.name, cur);
    });
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function revenueByHour(state, key) {
  const hours = ordersOn(state, key).filter(isRevenue).map((o) => new Date(o.placedAt).getHours());
  const from = Math.min(8, ...(hours.length ? hours : [8]));
  const to = Math.max(21, ...(hours.length ? hours : [21]));
  const buckets = [];
  for (let hh = from; hh <= to; hh += 1) buckets.push({ label: String(hh).padStart(2, '0'), value: 0, orders: 0 });
  ordersOn(state, key).filter(isRevenue).forEach((o) => {
    const hh = new Date(o.placedAt).getHours();
    const b = buckets.find((x) => Number(x.label) === hh);
    if (b) { b.value += o.total; b.orders += 1; }
  });
  return buckets;
}

export function revenueByCategory(state, key) {
  const map = new Map(CATEGORIES.map((c) => [c.id, { label: c.name, value: 0, id: c.id }]));
  ordersOn(state, key).filter(isRevenue).forEach((o) => {
    o.items.forEach((it) => {
      const row = map.get(it.category);
      if (row) row.value += it.price * it.qty;
    });
  });
  return [...map.values()];
}

export function lastDays(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export function lowStock(state) {
  const limit = state.settings.lowStockAt;
  return state.products
    .filter((p) => p.active && p.stock <= limit)
    .sort((a, b) => a.stock - b.stock);
}

export const productById = (state, id) => state.products.find((p) => p.id === id);
export const orderByNo = (state, no) => {
  const want = String(no).toUpperCase().replace(/[^0-9]/g, '');
  return state.orders.find((o) => o.no.replace(/[^0-9]/g, '') === want);
};
export const discountByCode = (state, code) =>
  state.discounts.find((d) => d.code.toUpperCase() === String(code || '').trim().toUpperCase());

# Cartline — technical notes

Architecture, data model, module map and the things worth knowing before you extend it.

## How this demo works

**You can actually use it.** Every flow writes. Checkout creates an order, board buttons change its
status, the inventory table edits products, the discounts screen changes what the cart accepts, and
settings changes what the other screens compute with.

**Your data stays on your machine.** State lives in one `localStorage` key, `cartline.state.v1`.
There is no account, no backend, no network call of any kind, and no real payment. Clearing browser
data or pressing "Reset demo data" removes it. Nothing syncs between browsers or devices.

**The assistant is simulated.** `src/agent.js` matches the question against regular expressions and
keywords, then builds the answer from the live store. There is no model and no request; the
streaming and the "worked on it" trace are presentation.

## Principles

1. **No dependencies, no build.** Native ES modules over HTTP. Nothing to install, nothing to
   compile, nothing to keep up to date.
2. **No network.** There is no `fetch` in the codebase. The only external origin is the Google
   Fonts stylesheet in `index.html`.
3. **One store, many readers.** Views never keep a second copy of the truth. They read
   `ctx.state`, write through `ctx.store.update()`, and repaint.
4. **Solid colour only.** No gradients, no blur, no glow, no emoji. Colour never carries meaning
   on its own — every status pill also carries a word.

## Runtime shape

```
index.html
  └─ src/main.js                     boot
       ├─ createStore(KEY, seedState)   state + persistence
       ├─ shell (sidebar, topbar, view host)
       ├─ router(ROUTES, cb)            hash routing
       ├─ buildAgent(ctx).mount()       assistant launcher
       └─ paintView() → ROUTES[name].render(ctx, params, query) → Node
```

`paintView()` empties `#view` and asks the active view module for a fresh node. Views are plain
functions; there is no virtual DOM and no component lifecycle. A view that needs to redraw part of
itself keeps a local `paint()` closure — that is why filters and search boxes do not lose focus.

`store.subscribe()` is used only for chrome (cart badge, nav counts, active link). Full redraws are
explicit, through `ctx.rerender()`.

### The context object

Every view receives `ctx`:

| Member | Purpose |
|---|---|
| `ctx.store` | The store itself, for `update()` and `reset()`. |
| `ctx.state` | Getter for the current state. Always read it fresh; never cache it across an update. |
| `ctx.nav(path)` | Navigate, e.g. `ctx.nav('board')` or `ctx.nav('track?no=CL-1052')`. |
| `ctx.rerender()` | Repaint the whole current view. |
| `ctx.syncChrome()` | Refresh the cart badge and nav counts without a repaint. |
| `ctx.openCart()` | Toggle the cart drawer. |
| `ctx.currency()` | The currency symbol from settings. |
| `ctx.today()` | Today's local day key, `YYYY-MM-DD`. |

## Data model

One object, one localStorage key.

```js
{
  version: 1,
  settings: {
    storeName, tagline, currency, taxPct, lowStockAt,
    prepMinutes, acceptingOrders, counterName
  },
  products:  [Product],
  discounts: [Discount],
  orders:    [Order],          // newest first
  cart:      { items: [{ productId, qty }], code },
  counter:   1131,             // last order number issued
  lastOrderNo: 'CL-1131',
  face: 'shop'
}
```

**Product**

```js
{ id:'P006', sku:'MEA-006', name:'Chicken Biryani', category:'meals', tone:2,
  price:220, cost:128, stock:8, description:'…', active:true, prepMins:14 }
```

`tone` is 1–6 and picks the solid tile colour class (`tone-1` … `tone-6` in `cartline.css`), one
per category. There are no product images anywhere in the app.

**Discount**

```js
{ code:'WEEKEND10', kind:'pct'|'flat', value:10, minOrder:500,
  active:true, uses:31, maxUses:400, note:'…' }
```

**Order**

```js
{ id:'O1131', no:'CL-1131', customer, channel:'Counter'|'Pickup'|'Delivery', area, note,
  items:[{ productId, name, price, qty, category }],
  subtotal, discountAmt, discountCode, tax, delivery, total,
  payment:'UPI'|'Card'|'Cash',
  status:'new'|'preparing'|'ready'|'completed'|'refunded'|'cancelled',
  placedAt, updatedAt, handledBy,
  refund: null | { amount, reason, note, at, by },
  timeline:[{ at, label, by }] }
```

Order lines snapshot the name, price and category at the moment of sale, so editing a product later
never rewrites history.

### Pricing

`priceCart(items, settings, discount)` in `src/data.js` is the single pricing function, used by the
cart, the checkout and the seed generator:

```
subtotal  = Σ price × qty
discount  = pct ? round(subtotal × value / 100) : min(value, subtotal)   // only if active and subtotal ≥ minOrder
tax       = round((subtotal − discount) × taxPct / 100)
total     = subtotal − discount + tax
```

### Derived reads

All in `src/data.js`, all pure functions of state — nothing is precomputed or cached:

`dayKey` · `dayLabel` · `lastDays(n)` · `ordersOn(state, key)` · `daySummary(state, key)` ·
`topItems(state, key, limit)` · `revenueByHour` · `revenueByCategory` · `lowStock` ·
`productById` · `orderByNo` · `discountByCode`

`dayKey` uses local date parts, not `toISOString()`, so a day boundary is the shop's day and not
UTC's.

### The seed

`seedState()` builds the dataset from `seeded(20260808)`, a fixed-seed linear congruential
generator, so a fresh browser always sees the same sample: 27 products across 6 categories, 4
discount codes, six closed days of orders plus a live day whose open tickets are minutes old rather
than hours. Refunds and cancellations are sprinkled in so the refund and cancellation screens have
something real to show.

## Module map

| Module | Exports | Notes |
|---|---|---|
| `lib/ui.js` | `h`, `qs`, `qsa`, `on`, `esc`, `money`, `num`, `pct`, `fmtDate`, `fmtTime`, `ago`, `isoDay`, `daysFromNow`, `seeded`, `pick`, `between`, `createStore`, `router`, `toast`, `modal`, `confirmDialog`, `downloadCSV`, `barChart`, `meter`, `icon`, `ICONS` | Shared kit, copied unmodified. |
| `lib/assistant.js` | `Assistant` | Shared kit, copied unmodified. |
| `src/data.js` | `STORAGE_KEY`, `seedState`, constants, derived reads | No DOM. |
| `src/cart.js` | `cartLines`, `cartCount`, `cartTotals`, `addToCart`, `setQty`, `clearCart`, `showCart`, `toggleCart`, `closeCart`, `stepper`, `totalRow`, `initialsOf` | Cart state and drawer. |
| `src/orderops.js` | `nextStatus`, `setStatus`, `advance`, `cancelOrder`, `refundOrder`, `openOrder`, `closeOrder`, `STEP_LABEL` | Everything that mutates an order. |
| `src/agent.js` | `buildAgent(ctx)` | 15 intents plus 4 fallbacks. |
| `src/views/shop.js` | `render(ctx)` | Grid, filters, product modal. |
| `src/views/checkout.js` | `render(ctx)`, `placeOrder(ctx, form)` | Three-step flow; `placeOrder` is the only writer of new orders. |
| `src/views/track.js` | `render(ctx, params, query)`, `pillClass(status)` | Reads `?no=` from the hash query. |
| `src/views/board.js` | `render(ctx)` | Four columns, stale flagging. |
| `src/views/orders.js` | `render(ctx)` | Table, filters, CSV. |
| `src/views/products.js` | `render(ctx)` | Inventory, add/edit modal, restock. |
| `src/views/discounts.js` | `render(ctx)` | Codes and their cost. |
| `src/views/summary.js` | `render(ctx)` | Day picker, charts, exports. |
| `src/views/settings.js` | `render(ctx)` | Settings and demo controls. |

## The write paths

Three flows do the real work, and everything else reads what they leave behind.

1. **Checkout → order.** `placeOrder()` snapshots the cart, decrements stock on each line,
   increments the discount code's `uses`, unshifts the order, bumps `counter` and empties the cart.
   The order appears on the board, in the ledger, in the day summary and to the assistant.
2. **Board → status.** `advance()` moves along `new → preparing → ready → completed` and appends a
   timeline entry stamped with the counter name from settings.
3. **Refund.** `refundOrder()` collects amount, reason, note and an optional restock, then asks for
   confirmation through `confirmDialog` before writing. A refund keeps gross revenue intact and
   subtracts from net, which is how the day summary reports it.

Product edits, restocks, discount changes and settings edits are all persisted the same way.

## Assistant intents

`buildAgent(ctx)` returns an `Assistant` configured with these intents. Each one reads live state,
so answers change after you use the app.

| Intent | Matches on | Answers with |
|---|---|---|
| `revenue-today` | revenue, takings, sales, turnover | Gross, net, refunds, today against yesterday |
| `best-sellers` | best selling, top item, most sold | Today's top five items by quantity |
| `low-stock` | low stock, restock, running out | Products at or under the threshold and the top-up cost |
| `order-status` | `CL-1052`, order status, track | One order: status, totals, lines, last movement |
| `refunds` | refund, money back, returned | Seven-day refund count, value, reasons ranked |
| `aov` | average order, basket size, aov | Today's average order value against the week |
| `queue` | open orders, queue, backlog, how busy | Live board load, oldest ticket, late count |
| `discounts` | discount, coupon, promo, code | What each code gave away in seven days |
| `category` | category, section, a category name | Today's revenue split by category |
| `busiest` | busiest, peak, rush, what time | Peak trading hour and the quietest one |
| `week` | this week, last 7, trend, yesterday | Seven day-by-day rows, strongest day |
| `stock-value` | stock value, inventory, holding | Catalogue at cost and at shelf price |
| `customers` | customer, repeat, biggest spender | Seven-day spend by name, repeat count |
| `today-shape` | how is today, day so far, overview | The whole day in one paragraph |
| `help` | what can you, help, capabilities | The list above, in plain language |

Anything unmatched falls through to one of four fallbacks that name what the agent *can* answer.

### Adding an intent

```js
{
  id: 'wastage',
  match: [/wastage|thrown out|expired/i, 'wastage'],
  trace: 'compared stock movements against sales',
  answer: (q, ctx) => ({
    text: `Nothing is tracked as wastage yet — ${num(ctx.summary.items)} items sold today.`,
    table: { head: ['Item', 'Qty'], rows: [] },
    suggestions: ['What is low on stock?'],
  }),
}
```

Push it into the `intents` array in `src/agent.js`. Regex matches score 2, keyword matches score 1,
and the highest score wins, so keep regexes specific enough not to swallow neighbouring intents.

## Extending

**A new screen.** Create `src/views/promotions.js` exporting `default function render(ctx)` that
returns a Node, then add one line to `ROUTES` in `src/main.js`:

```js
promotions: { face: 'ops', label: 'Promotions', icon: 'spark',
              title: 'Promotions', sub: 'Operations', render: renderPromotions },
```

The sidebar, the face switch, the title and the number shortcuts pick it up automatically.

**A new field on a record.** Add it in `seedState()` so fresh installs have it, and guard reads for
browsers holding older state — or bump `STORAGE_KEY` to `cartline.state.v2` to force a reseed.

**A new nav count.** Add an entry to the `counts` object in `syncChrome()` in `src/main.js`.

**A new status.** `STATUSES` in `src/data.js` drives the board columns, the tracking strip and
`nextStatus()`. Adding to that array adds a column.

## Accessibility

- Semantic landmarks: `aside` sidebar, `header` topbar, `nav`, `main`.
- Every icon-only button carries an `aria-label`; filter chips carry `aria-pressed`; the face
  switch is a labelled `role="group"` of pressed buttons; the checkout steps use `aria-current`.
- Focus ring is the kit's `:focus-visible` amber outline, never removed.
- Status is never colour alone — every pill has a word, and the channel split bar carries an
  `aria-label` with the percentages.
- Drawers and modals close on `Escape` and on a click outside.
- Works down to 390px with no horizontal scroll. Under 900px the sidebar slides in behind the menu
  button; the board falls to two columns, then one.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Open or close Cartline Assist |
| `C` | Open or close the cart drawer |
| `B` | Switch face — storefront ↔ operations |
| `1`–`6` | Jump to the nth section of the current face |
| `/` | Focus the search box on the current screen |
| `Esc` | Close drawer, modal, or the mobile navigation |

Shortcuts are ignored while typing in an input, textarea or select.

## Design tokens

Everything comes from `assets/app.css`. `assets/cartline.css` adds components but no new colours.

| Token | Value | Used for |
|---|---|---|
| `--bg`, `--surface` | `#FFFFFF` | Page and card ground |
| `--surface-2` | `#FAFAF8` | Table headers, board columns, assistant log |
| `--hover` | `#FEFBEA` | Row and button hover |
| `--ink` / `--ink-2` / `--muted` / `--faint` | `#17181A` / `#2E3033` / `#5A5F66` / `#686E75` | Text ramp |
| `--line` / `--line-2` | `#E7E7E4` / `#D8D8D3` | Hairlines and control borders |
| `--amber` / `--amber-fill` | `#EAC81C` | Brand fill — always with `--on-amber` ink on top |
| `--amber-deep` | `#8A6D00` | Brand colour as *text* on white |
| `--amber-soft` / `--amber-line` | `#FEF9DA` / `#F0DE8C` | Active nav, accent stats, banners |
| `--ok` / `--warn` / `--bad` / `--info` (+ `-soft`, `-line`) | | Status pills, tiles, meters |
| `--r-lg` / `--r` / `--r-sm` / `--r-xs` | 12 / 8 / 6 / 4 px | Radii |
| `--sans` / `--mono` | Inter / JetBrains Mono | UI text / numbers, labels, codes |
| `--sidebar` / `--bar` / `--gutter` | 248 / 60 / 20 px | Shell metrics |

Rules that are not negotiable: yellow is a fill with ink on it, never text on white — use
`--amber-deep` for that. No gradients, no blur, no glow shadows, no emoji as icons. Icons are
inline stroke SVG using `currentColor`, from `ICONS` in `lib/ui.js`.

## Verifying a change

```bash
# syntax
for f in $(find . -name '*.js'); do cp "$f" /tmp/chk.mjs && node --check /tmp/chk.mjs || echo "FAIL $f"; done

# serve and load — expect zero console errors
python3 -m http.server 4103
```

Then walk the loop that matters: add to cart → checkout → the order shows on the board → advance it
→ refund it → the day summary and the assistant both change.

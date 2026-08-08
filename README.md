# Cartline

An ordering and storefront demo application. Two faces of the same shop, switchable from the
topbar: a customer **Storefront** where you browse, fill a cart and check out, and an
**Operations** side where the counter works the order board, watches stock, runs discount codes
and closes the day.

A checkout on the storefront writes a real order. It lands on the operations board as `new`,
takes stock down, counts against the discount code it used and moves the day summary. That single
loop is the point of the app.

Plain HTML, CSS and ES modules. No dependencies, no build step, no bundler, no backend.

**Author:** Muhammed Nasvih V — [nasvih.in](https://www.nasvih.in) · [github.com/nasvih](https://github.com/nasvih)

---

## How this demo works

**You can actually use it.** Nothing is read-only. Place orders, move them across the board, edit
products and prices, restock, create or pause discount codes, refund an order — every screen
writes to the same store that the other screens read.

**Your data stays on your machine.** Everything you enter is saved in this browser's local storage
under the key `cartline.state.v1`. Nothing is sent to a server: there is no account, no backend and
no real payment. Clear your browser data, or use "Reset demo data", and it is gone. It does not
sync between browsers or devices.

**The assistant is simulated.** Cartline Assist answers by matching your question against this
app's own demo data. It is a demonstration of the interaction, not a connected model, and no
request leaves your browser.

---

## Screens

### Storefront

| Screen | What it does |
|---|---|
| **Shop** | Category chips, search, product grid built from solid colour tiles. Click a tile for the product modal with description, prep time, stock state and a quantity stepper. |
| **Checkout** | Three steps — order details, a simulated payment with a declined-payment switch, then a confirmation carrying the order number, the ready-by time and what the order changed. |
| **Track an order** | Look an order up by number. Status strip, timeline, items, totals, and the refund reason if there is one. Recent numbers are one click away. |

The cart is a drawer, reachable from the topbar on any screen or with `C`. It carries quantity
steppers, a discount code box with live validation, and the running subtotal, discount, tax and
total.

### Operations

| Screen | What it does |
|---|---|
| **Order board** | Four columns — new, preparing, ready, completed. Cards show the ticket, the items, the age and a flag when an order passes the promised prep time. Advance a card with one button or open the detail drawer. |
| **Orders** | The full ledger with search and status, channel and day filters. Row opens the detail drawer; refunds sit behind a confirm dialog. CSV export. |
| **Products and stock** | Inventory table with low-stock and out-of-stock flags, margin per line, inline restock, hide/list, an add-and-edit modal with validation, and CSV export. |
| **Discount codes** | Create, edit, pause and delete codes. Each row shows uses and what the code gave away over seven days. Pausing a code stops the storefront accepting it immediately. |
| **Day summary** | Pick any of the last seven days: orders, gross, average order value, refunds, net, revenue by hour, top items, revenue by category, revenue by channel, and the day's order list. Exports to CSV. |
| **Store settings** | Store name, tagline, counter name, accepting-orders switch, tax percent, low-stock threshold and prep minutes. Every one of them changes the other screens. |

### Cartline Assist

The assistant sits behind the floating launcher, or `⌘K` / `Ctrl K`. It answers from live state —
today's revenue, best sellers, low stock, an order by its number, refund reasons, average order
value, the open queue, discount usage, category split, the busiest hour, the week so far, stock
value and customers. Place an order and ask again; the numbers move.

---

## Run it

No install step. Any static file server will do:

```bash
cd cartline
python3 -m http.server 4103
```

Then open <http://localhost:4103>.

It must be served over HTTP — ES modules do not load from `file://`.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, folder `/`.
3. The site appears at `https://<user>.github.io/cartline/`.

`.nojekyll` is committed so Pages serves the `/lib` and `/assets` folders untouched. Every path in
the app is relative, so it works from a subfolder without configuration.

## Structure

| Path | What it holds |
|---|---|
| `index.html` | The only page. Fonts, stylesheets, `#app` mount, `noscript` line. |
| `assets/app.css` | Shared design system: tokens, shell, buttons, tables, forms, modal, assistant. |
| `assets/cartline.css` | App-specific components only — product tiles, cart lines, checkout steps, board columns. |
| `lib/ui.js` | DOM helpers, formatting, seeded random, store, hash router, toast, modal, CSV, charts, icons. |
| `lib/assistant.js` | The assistant engine: intent routing, word-by-word streaming, panel and docked mount. |
| `src/main.js` | Boot: store, shell, sidebar, topbar, routing, keyboard, assistant mount. |
| `src/data.js` | Seeded demo dataset and every derived read (day summary, top items, low stock). |
| `src/cart.js` | Cart state and the cart drawer. |
| `src/orderops.js` | Status moves, order detail drawer, cancel and refund. |
| `src/agent.js` | Cartline Assist — 15 intents over live store state. |
| `src/views/*.js` | One module per screen, each exporting `render(ctx)`. |

## Demo notes

- The store is **Malabar Pantry**, an invented bakery and provisions shop in Kochi. Every name,
  product and figure is made up. Currency is `₹`.
- Seven days of orders are generated from a fixed seed, so the sample looks the same on a fresh
  browser. Once you touch anything, your copy diverges — that is the point.
- Order numbers run from `CL-1042` upwards. New checkouts continue the sequence.
- "Reset demo data" lives in the sidebar footer and on Store settings, and rebuilds the original
  seed.

## Keyboard

| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Open Cartline Assist |
| `C` | Open or close the cart |
| `B` | Switch between storefront and operations |
| `1`–`6` | Jump to a section in the current face |
| `/` | Focus the search box on the current screen |
| `Esc` | Close a drawer, modal or the mobile navigation |

## Licence

MIT — see [LICENSE](LICENSE).

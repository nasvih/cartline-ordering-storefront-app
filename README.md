# Cartline

An ordering and storefront demo application. Two faces of the same shop, switchable from the
topbar: a customer **Storefront** where you browse, fill a cart and check out, and an
**Operations** side where the counter works the order board, watches stock, runs discount codes
and closes the day.

A checkout on the storefront writes a real order. It lands on the operations board as `new`,
takes stock down, counts against the discount code it used and moves the day summary. That single
loop is the point of the app.

Plain HTML, CSS and ES modules. No dependencies, no build step, no bundler, no backend.

**Source:** <https://github.com/nasvih/cartline-ordering-storefront-app>

**Author:** Muhammed Nasvih V — [nasvih.in](https://www.nasvih.in) · [github.com/nasvih](https://github.com/nasvih)

---

## Tech stack

| Layer | What it is |
|---|---|
| Markup and styles | Plain HTML and CSS. One page, hash-routed. No framework, no bundler, no build step, no dependencies to install. |
| Code | ES modules loaded straight by the browser (`<script type="module">`). |
| State | `localStorage` — the whole shop lives under `cartline.state.v1`, with view preferences, the theme and read notifications in keys of their own. No backend, no database, no API. |
| Icons | Inline stroke SVG using `currentColor`. No icon font, no sprite sheet. |
| Product photography | 26 PNG cut-outs committed to `assets/products/`. No image CDN — the app makes no image request off its own origin. |
| External requests | One: Inter and JetBrains Mono from Google Fonts. Nothing else leaves the browser. |
| Offline and install | A service worker (`sw.js`) caching the whole shell, plus a web app manifest so it installs to the dock or home screen. |
| Assistant | Cartline Assist is a local intent matcher over the app's own data — regular expressions, the live store, and a typing animation. There is no model and no network call. |

The checkout's payment step is simulated: a timed animation with a switch to force a decline. No
card details are asked for, taken or sent anywhere.

## What this is

Cartline is an ordering and storefront application with two faces over one set of records.
Customers browse the catalogue, fill a cart and check out on the storefront; the shop runs the day
on the operations side — the order board, products and stock, discount codes and the day summary.

They are not two systems. An order placed on the storefront is the same record the board moves
from new to preparing to ready, the same record that took stock down, and the same record the day
summary counts.

## Where it helps a business

- Orders arrive as records rather than as messages, so nothing is missed at a busy hour.
- The kitchen or counter works one board instead of a stack of chits.
- Stock counts move as orders are placed, so what is nearly out is visible before it runs out.
- Refunds carry a reason, which is what makes them reviewable later.
- The day's takings, average order value and best sellers are a screen rather than an evening's
  arithmetic.

## How it would work for real

The same interface, with browser storage swapped for a real database, a real payment provider in
place of the simulated step, staff accounts so actions are attributable, and printing or a counter
display for the kitchen. What you are looking at is the interface and the workflow, not the
production system behind them.

## How this demo works

**You can actually use it.** Nothing is read-only. Place orders, move them across the board, edit
products and prices, restock, create or pause discount codes, refund an order — every screen
writes to the same store that the other screens read.

**Your data stays on your machine.** Everything you enter is saved in this browser's local storage
under the key `cartline.state.v1`. Nothing is sent to a server: there is no account, no backend and
no real payment. Clear your browser data, or use "Reset demo data", and it is gone. It does not
sync between browsers or devices.

**The payment step is simulated.** No card details are asked for, taken or sent anywhere.

**The assistant is simulated.** Cartline Assist answers by matching your question against this
app's own demo data. It is a demonstration of the interaction, not a connected model, and no
request leaves your browser.

---

## Screens

### Storefront

| Screen | What it does |
|---|---|
| **Shop** | Category chips, search, and a product grid of real photographs — with the solid colour tile as the fallback for anything without one. Click a card for the product modal with description, prep time, stock state and a quantity stepper. |
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

The assistant sits behind the round launcher at the bottom right, or `⌘K` / `Ctrl K` — those are
the only two ways in.

**It answers from live state:** today's revenue, best sellers, low stock, an order by its number,
refund reasons, average order value, the open queue, discount usage, category split, the busiest
hour, the week so far, stock value and customers. Place an order and ask again; the numbers move.

**It also does things.** Six of its intents change the shop rather than report on it. Each one
names the exact record, shows the change before and after, and refuses politely when the sentence
is ambiguous ("two products match 'coffee' — I will not guess which one you mean"). Nothing is
written until you press the button on its reply.

| Ask it | What happens |
|---|---|
| `Restock Karak Chai by 24` | Names the product and its SKU, shows 18 → 42 with the stock value either side, writes it to Products and stock. |
| `Change the price of Filter Coffee to 45` | Old price, new price, what it does to the margin. Refuses any price at or below cost. |
| `Move CL-1052 to ready` | Pulls the order, shows preparing → ready, moves the card on the board and appends a timeline entry the customer sees. |
| `Refund CL-1049, wrong item packed` | Customer, amount and every line first. Applying it marks the order refunded, records the reason and puts the items back into stock. With no reason given it offers the recorded reasons as buttons. |
| `10% off drinks until Friday, code MONSOON` | Reads the size, the code and the date out of the sentence, says plainly what the demo can and cannot enforce, creates the code live on the storefront. |
| `Mark Mango Lassi out of stock` | Stock to zero, dropped from any open cart, the storefront card flips to "Sold out". `Put Mango Lassi back in stock with 24` reverses it. |

Ask **"What can you do?"** and it lists all six with an example each. The same examples are in the
About this demo modal.

---

## Topbar controls

| Control | What it does |
|---|---|
| **Notifications** | A bell with an unread count. The panel is built from the live records — orders waiting, orders past the prep promise, products under the low-stock line, refunds taken today — so it can never go stale: restock a product and its notice goes. Mark one or all read; what you have read is remembered under `cartline.notifications.v1`. |
| **Device preview** | Desktop and phone. Phone mode covers the page with the brand yellow and runs the app inside a 390 × 844 iframe in a dark bezel — a real viewport, so the app's own breakpoints do the work rather than a scaled picture of them. The framed copy is passed `?frame=1` and hides the toggle, so there is no phone inside a phone. "Back to desktop", or `Esc`, leaves. |
| **Dark mode** | Writes `data-theme="dark"` on `<html>` and remembers it under `cartline.theme.v1`. The first visit follows your operating system; once you pick a side, that choice sticks. The brand yellow does not change in the dark — it keeps ink text on it, everywhere it appears. |

"About this demo" sits at the end of the same row and opens the modal.

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

## Install it

Cartline ships a web app manifest and a service worker, so a browser can install it to the dock or
home screen and it opens in its own window. "Install app" appears in the sidebar footer when the
browser offers it; on iPhone and iPad the route is Share → Add to Home Screen.

The service worker caches the whole app, including every product photograph, so it keeps working
with no connection. Bump `CACHE_VERSION` in `sw.js` whenever a cached file changes.

## Product photography

The 26 product photographs are stored in this repository under `assets/products/`. Nothing is
hotlinked — the app makes no image request off its own origin. Photographer, source and licence for
each one are listed in [CREDITS.md](CREDITS.md). They are not covered by this repository's licence —
each photograph stays under its own upstream licence and belongs to the photographer credited there.

Each file is the product cut out of its photograph — a 600px square PNG with a transparent
background — so a tile shows the object and nothing else, sitting on the app's own white surface
under a soft shadow that CSS draws from the PNG's alpha. `CREDITS.md` records that every one of
them was edited this way, and which ten photographs were swapped to get a clean cut-out.

A product with no photograph keeps the solid colour tile carrying its initials, and a photograph
that fails to load falls back to the same tile, so the grid never shows a hole.

## The sidebar

Two icon-only controls sit on the brand row, at the top of the sidebar, next to the app name. Both
are remembered in `localStorage` under `cartline.chrome.v1` — a key of its own, so "Reset demo
data" rebuilds the shop without changing how you like the sidebar.

| Control | What it does |
|---|---|
| **Sidebar colour** | Switches the sidebar between the brand yellow and plain white. Yellow is the default, always with ink text — never white text on yellow. |
| **Collapse / Expand sidebar** | Drops the sidebar to a 64px icon rail. Every label stays reachable as `title` and `aria-label`. Above 900px only: below that the sidebar is already a drawer. |

The footer, top to bottom: [nasvih.in](https://www.nasvih.in) and **GitHub** sharing a row; then
"Install app" — which only appears once the browser offers one — beside "Reset demo data". The link
to nasvih.in is the one dark control down there; everything else is an outline button. "About this
demo" is not here: it is a topbar button.

## Structure

| Path | What it holds |
|---|---|
| `index.html` | The only page. Fonts, stylesheets, `#app` mount, `noscript` line. |
| `assets/app.css` | Shared design system: tokens, shell, buttons, tables, forms, modal, assistant. |
| `assets/cartline.css` | App-specific components only — product tiles and photographs, cart lines, checkout steps, board columns. |
| `assets/products/*.png` | The 26 product cut-outs, 600px square with a transparent background. See `CREDITS.md`. |
| `assets/icons/*.png` | Installed-app icons, 192 and 512, plus a maskable 512. |
| `manifest.webmanifest` | Web app manifest — name, icons, colours, standalone display. |
| `sw.js` | Service worker: caches the app and its photographs for offline use. |
| `lib/ui.js` | DOM helpers, formatting, seeded random, store, hash router, toast, modal, CSV, charts, icons. |
| `lib/assistant.js` | The assistant engine: intent routing, word-by-word streaming, panel and docked mount. |
| `lib/pwa.js` | Service worker registration and the "Install app" control. |
| `src/main.js` | Boot: store, shell, sidebar, topbar, routing, keyboard, assistant mount. |
| `src/data.js` | Seeded demo dataset and every derived read (day summary, top items, low stock). |
| `src/cart.js` | Cart state and the cart drawer. |
| `src/orderops.js` | Status moves, order detail drawer, cancel and refund. |
| `src/agent.js` | Cartline Assist — the reading intents, and the assistant's configuration. |
| `src/actions.js` | The six intents that change the shop, their sentence parsers and their refusals. |
| `src/notify.js` | The notification feed derived from the store, the bell and its panel. |
| `src/chrome.js` | Dark mode and the phone preview frame. |
| `src/views/*.js` | One module per screen, each exporting `render(ctx)`. |

## Demo notes

- The store is **Malabar Pantry**, an invented bakery and provisions shop in Kochi. Every name,
  product and figure is made up. Currency is `₹`.
- Seven days of orders are generated from a fixed seed, so the sample looks the same on a fresh
  browser. Once you touch anything, your copy diverges — that is the point.
- Order numbers run from `CL-1042` upwards. New checkouts continue the sequence.
- "Reset demo data" lives in the sidebar footer and on Store settings, and rebuilds the original
  seed. It does not touch the view preferences, which live under keys of their own:
  `cartline.chrome.v1` (sidebar colour and rail), `cartline.theme.v1` (light or dark) and
  `cartline.notifications.v1` (which notices you have read).

## Keyboard

| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Open Cartline Assist |
| `C` | Open or close the cart |
| `B` | Switch between storefront and operations |
| `1`–`6` | Jump to a section in the current face |
| `/` | Focus the search box on the current screen |
| `Esc` | Close a drawer, modal, the notifications panel, the phone preview or the mobile navigation |

## Licence

All rights reserved. This repository is source-available: you may read it, run it locally and evaluate it, but copying, modifying, redistributing or using it in your own work needs written permission — see [LICENSE](LICENSE).

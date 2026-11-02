# Basil & Ember

A modern, premium-looking website for **Basil & Ember**, a fictional neighborhood
wood-fired pizza restaurant. React + Vite + TypeScript. No backend, no payments —
all menu data lives in code and orders/reservations are demo flows.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173) in your browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Run tests in watch mode |

## Pages

- **Home** (`/`) — hero, neighborhood favorites, how pickup works, hours snapshot
- **Menu** (`/menu`) — category chips, dietary filters (vegetarian / vegan /
  gluten-free / spicy), and text search over 17 made-up dishes
- **Item** (`/menu/:id`) — size picker (10″ / 12″ / 16″ with price deltas),
  topping add-ons, kitchen notes, quantity; live price
- **Cart** (`/cart`) — quantity editing, line removal, subtotal + 8.5% tax;
  persists in `localStorage`
- **Pickup checkout** (`/checkout`) — name, phone, pickup-time slot; validated,
  no payment taken
- **Confirmation** (`/confirmation`) — order number, pickup details, summary
- **Reservations** (`/reserve`) — date, time, party size, occasion; validated
  with a confirmation state
- **About & contact** (`/about`) — story, full hours with today highlighted,
  address, phone, email, and a contact form

## Structure

- `src/data/menu.ts` — menu items, categories, sizes, toppings
- `src/lib/pricing.ts` — unit pricing, cart-line identity, totals (unit-tested)
- `src/context/CartContext.tsx` — cart state with `localStorage` persistence
- `src/pages/` — one component per page; `src/components/` — layout + menu card

Basil & Ember is fictional: 128 Fournier Street, Maplewood, OH · (513) 555-0148.

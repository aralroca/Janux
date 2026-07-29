# Cross-island state

One mini cart, five islands, zero prop drilling. The grid adds, the header badge counts, the panel lists, a toast reacts and the inventory re-checks the server — all through the shared-state APIs:

- **`store()`** — the cart is a store, not synchronized copies: every island declares `use: { cart: Cart }` and reads/writes the same state. Mutations only happen through named, schema-validated store intents, so agents see `store://cart` (with its `readers`) and call `cart.add` exactly like a click does.
- **`persistStore()`** — the store declares `persist: 'local'`, which routes it through `persistStore` on mount: the cart rehydrates from localStorage and survives a reload. SSR still ships a per-request store (no shared-singleton leaks); the client corrects it on boot.
- **`createBus()` events** — the runtime creates one bus per page inside `boot()` (calling `createBus()` yourself is for tests and custom embeddings — the e2e suite does exactly that). `Cart` declares `emits: 'cart.itemAdded'` and the Toasts island hears it with an `on:` handler, without importing the grid.
- **`onEvent()`** — the Inventory island's source uses `refresh: onEvent('cart.itemAdded')`: no timer, no polling, one server re-query per event. Watch the check counter grow as you add products.
- **`batch()`** — "Add the whole bundle" wraps three `cart.add` calls in a single `batch()`, so every subscriber flushes once. The cart panel exposes a `data-paints` repaint counter: the three-product bundle costs exactly the same repaints as a single add. (Intents already batch their own `run()` — the explicit `batch()` shows how nested batches join the outer one.)

```bash
bun install
bun run dev   # http://localhost:4321
```

## Where things live

| File | What it is |
| --- | --- |
| `src/stores.ts` | The `Cart` store — state, derived, intents, `emits`, `persist: 'local'`. SSR loads it from here. |
| `src/components/ProductGrid.tsx` | Island A: writes to the store; `addBundle` shows `batch()`. |
| `src/components/CartBadge.tsx` | Island B: pure reader in the header. |
| `src/components/CartPanel.tsx` | Island C: lines, totals, remove/clear — plus the `data-paints` counter. |
| `src/components/Toasts.tsx` | Island D: `on: 'cart.itemAdded'` — reacts to the bus event. |
| `src/components/Inventory.tsx` | Island E: `refresh: onEvent('cart.itemAdded')` source. |
| `src/server/inventory.api.ts` | The server counter the Inventory island re-queries. |
| `src/client.ts` | `boot({ defs })` — components and the store, resumed from SSR snapshots. |

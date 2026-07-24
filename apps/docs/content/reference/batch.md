# batch()

```ts
import { batch } from 'janux';

batch(() => {
  price.value = 300;
  qty.value = 4;
});   // subscribers run once, not twice
```

Groups writes so every affected effect runs **once**, after the function returns. `batch<T>(fn: () => T): T` — returns whatever `fn` returns.

```ts
import { signal, computed, watch, batch } from 'janux';

const price = signal(250);
const qty = signal(2);
let runs = 0;

watch(() => {
  price.value;
  qty.value;
  runs += 1;
});
// runs === 1 (initial)

batch(() => {
  price.value = 300;
  qty.value = 4;
});
// runs === 2, not 3 — one notification for both writes
```

## Nesting is transparent

An inner `batch` joins the outer one: notifications flush when the **outermost** batch exits. That makes it safe to batch inside a helper without knowing your caller:

```ts
function applyDiscount() {
  batch(() => { price.value *= 0.9; });   // joins any enclosing batch
}

batch(() => {
  applyDiscount();
  qty.value = 10;
});   // still a single flush
```

## Reads inside a batch see writes immediately

Batching defers *notifications*, not assignments — `price.value` inside the batch already returns the new value. Only subscriber re-runs wait.

## Intents batch for you

Every mutation inside an intent's `run()` is already applied as one atomic update: the view repaints once, the audit trail records one entry, and agents see one coherent state transition. Reach for `batch` when you're mutating raw signals outside a component.

Related: [`signal`](/docs/reference/signal) · [`watch`](/docs/reference/watch) · [Intents and guards](/docs/guide/intents-and-guards)

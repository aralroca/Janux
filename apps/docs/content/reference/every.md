# every / onEvent — refresh policies

Declare *when* a [`source`](/docs/guide/sources-effects-events) re-queries. Both builders return a `RefreshPolicy` (`{ everyMs?, events }`) for a source's `refresh` field.

```ts
import { source, every, onEvent } from 'janux';

sources: {
  stock: source({
    description: 'Live stock levels',
    query: ({ ctx }) => fetchStock(ctx),
    refresh: every('5m').orOn('inventory.changed'),
  }),
},
```

## every(interval)

`every(interval: string)` polls on a wall-clock interval. The string is parsed by [`parseDuration`](/docs/reference/parse-duration) — `'300ms'`, `'2s'`, `'5m'`, `'1h'`.

```ts
refresh: every('30s')
```

## .orOn(event)

Chains an event trigger onto the interval — the source refreshes on the timer **or** when the event fires on the bus, whichever comes first. Chain it repeatedly for several events:

```ts
refresh: every('5m').orOn('inventory.changed').orOn('order.placed')
```

Each `.orOn()` returns a new policy (the builder never mutates), so a shared base is safe to reuse:

```ts
const slow = every('10m');

const a = slow.orOn('a.changed');   // 10m + a.changed
const b = slow.orOn('b.changed');   // 10m + b.changed — unaffected by `a`
```

## onEvent(event)

`onEvent(event: string)` is the event-only policy: no timer, refresh strictly when the event fires.

```ts
refresh: onEvent('inventory.changed')
```

Use it for state that only ever changes in response to something you already emit — cheaper and more precise than polling. Events come from the same bus that carries component `emits`, store events and server events, so a server-side mutation can invalidate a client source by name.

Related: [`parseDuration`](/docs/reference/parse-duration) · [Sources, effects and events](/docs/guide/sources-effects-events) · [`createBus`](/docs/reference/create-bus)

---
title: api() — server functions as agent tools
description: "A server function defined once becomes three things: a validated HTTP endpoint, a typed client stub, and a registered agent tool."
---

# api() — server functions as agent tools

A server function defined once becomes three things: a validated HTTP endpoint, a typed client stub, and a registered agent tool.

```ts title="src/server/shop.api.ts"
import { api } from '@janux/server';
import { schema, str, money } from 'janux';

export const pay = api({
  description: 'Charge the cart. Irreversible monetary action.',
  input: schema({ total: money() }),
  output: schema({ orderId: str(), charged: money() }),
  guard: 'confirm',
  run: ({ input, ctx }) => payments.charge(input.total, ctx.userId),
});
```

## The three projections

1. **Endpoint.** `POST /_janux/api/shop.pay` — input validated before `run`, output validated after. Errors return a typed envelope with proper status codes (400 invalid input, 403 forbidden).
2. **Client stub.** `import { pay } from '../server/shop.api'` in client code compiles (via SWC, at build time) to a ~100-byte fetch stub. Server code, constants and imports **never** reach the browser bundle.
3. **Agent tool.** `api.shop.pay` appears in the manifest with the same description, schema and guard. Agent calls with `guard: 'confirm'` produce a server-side proposal; `POST /_janux/approve {id}` executes it exactly once.

## Callable everywhere

The value returned by `api()` is directly callable on the server too — SSR sources and other apis can invoke it without HTTP:

```ts
sources: {
  catalog: source({ query: () => catalog({}) }),  // direct call on SSR, fetch stub on the client
},
```

## Conventions

- Files live in `src/server/*.api.ts`; the filename is the namespace (`shop.api.ts` → `shop.*`).
- Only exported `const` values created with `api()` are collected.
- `ctx` carries the authenticated request context (via the server's `ctxFor` hook); agent invocations run under the end user's ctx, never a service identity.

## Rule of thumb

**Intents mutate UI state; apis mutate world state.** An intent that needs the world calls an api from its `run()`.

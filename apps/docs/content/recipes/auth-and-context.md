# Auth and request context

`ctx` is how identity flows through Janux: built once per request, injected everywhere, never global.

## Building ctx

`src/ctx.ts` is the convention: default-export a function of the request and every route, intent, source and `api()` receives what it returns.

```ts title="src/ctx.ts"
import { verifyCookie } from './auth';

export default async function ctxFor(req: Request) {
  const session = await verifyCookie(req.headers.get('cookie'));

  return { userId: session?.userId, role: session?.role ?? 'guest' };
}
```

`janux dev` and `janux start` both pick it up; there is nothing to register. Running your own server? It's the `ctxFor` option of [`createJanuxServer`](/docs/recipes/custom-server) — the convention just wires that for you.

No `src/ctx.ts` means `ctx` is `{}`: an app without auth pays nothing.

## Using ctx

```ts
// In an api()
export const myOrders = api({
  description: 'List my orders',
  run: ({ ctx }) => db.orders.byUser(ctx.userId),
});

```

```ts
// In a source
sources: { profile: source({ query: ({ ctx }) => loadProfile(ctx.userId) }) },

```

```ts
// In a route
export default function Page({ ctx }) { return ctx.userId ? <Dashboard /> : <Login />; }
```

## Dynamic guards by role

```ts
refund: intent({
  description: 'Refund an order',
  guard: ({ ctx }) => (ctx.role === 'admin' ? 'auto' : 'confirm'),
  run: ...
}),
```

Guards resolve per request: an admin's agent refunds unattended; everyone else's agent proposes and a human approves. **Forbidden tools disappear from the manifest** for that context — agents can't see what they can't call.

## The agent acts as the user

Agent invocations run under the **end user's ctx**, never a service identity. The copilot can do at most what its human can — guards then narrow further. There is no privilege escalation path through the agent endpoint.

> **Warning:** `x-janux-origin` distinguishes agent from human for *guard semantics* — it is not authentication. A caller lying about being human gains nothing your `ctxFor` didn't already grant them.

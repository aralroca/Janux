# Auth and request context

`ctx` is how identity flows through Janux: built once per request, injected everywhere, never global.

## Building ctx

```ts
// createJanuxServer option (the CLI wires this from src/server if you export it)
ctxFor: async (req) => {
  const session = await verifyCookie(req.headers.get('cookie'));

  return { userId: session?.userId, role: session?.role ?? 'guest' };
},
```

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

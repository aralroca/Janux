---
title: Auth and request context
description: "Identity flows through a Janux app in ctx: built once per request, injected everywhere it is needed, and never a global."
---

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

## Cross-site requests

A cookie proves *which browser* is calling. It never proves *which page told it to*. So an `api()` whose `ctx` comes from a session cookie is, on its own, callable by `evil.example`: the visitor's browser attaches the cookie, `run()` sees a perfectly valid `ctx.userId`, and the audit trail records a forged refund as a genuine one.

Set the session cookie `SameSite=Lax` — or `Strict`, if no inbound link ever needs to land already-logged-in:

```ts title="src/auth.ts"
export function sessionCookie(token: string): string {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
```

**And do not stop there.** `SameSite` is per-cookie hygiene, and it is weaker than it reads:

- **Same-*site* is not same-*origin*.** Every host under your registrable domain is same-site — `blog.example.com`, a forgotten staging box — so one subdomain takeover sends the cookie on the attacker's behalf.
- **`Lax` only covers the unsafe methods.** It still rides top-level cross-site navigations, and browsers have shipped exceptions for freshly-set cookies on top-level POSTs.
- **Cookies are not the only ambient credential.** HTTP Basic auth, TLS client certificates and IP allowlists are all attached automatically too, and `SameSite` says nothing about any of them.
- It is one attribute away from being gone: a cookie set without it, or with `SameSite=None`, loses the protection silently.

Which is why the guarantee does not live in your cookie. Every **mutating** request to `/_janux/*` — `api()` calls, `approve`/`reject`, the agent loop — is checked in the invocation pipeline, before a handler runs and therefore before anything can mutate:

1. **`Sec-Fetch-Site`** answers it whenever the browser sends it. `same-origin` passes, and so does `none` (you typed the URL, or opened a bookmark — there is no initiating page to have forged it). The browser sets this header and page JavaScript cannot, so it is the primary signal.
2. **`Origin`, then `Referer`** is the fallback for a browser too old for fetch metadata. It must match the app's own origin, or one you listed.
3. **Neither present is a refusal** — `403 {"ok": false, "error": "cross_site_denied"}`. This is the direction that matters: an attacker's page cannot suppress fetch metadata, so a mutating request that arrives with no evidence at all does not get the benefit of the doubt. Inverting it is the classic bypass.

Note that `same-site` is *not* enough by itself, for the subdomain reason above: it goes through the same origin comparison as a cross-site request.

A **read-only method is refused too** — `405 {"ok": false, "error": "method_not_allowed"}` — and not because of the caller. None of these endpoints has a read: they parse the body and run the tool whatever the verb, so a `GET` executes with your input schema's *defaults*. That shape needs no JavaScript to forge and no origin to be checked: `<img src="https://your.app/_janux/api/payments.transfer">` on any page anywhere, and the browser attaches the cookie itself. So `api()` is POST-only, from your own page as much as from anyone else's. Reads that *are* reads — the manifest, `.md` page projections, `/_janux/mcp` — are untouched.

Serving your own front-end from another host? List it — the default is same-origin only:

```ts
import { createJanuxServer } from '@janux/server';

const server = createJanuxServer({
  allowedOrigins: ['https://console.example.com'],
});
```

### Callers that are not browsers

A CLI, a cron job or a `curl` has no fetch metadata to send and no cookie jar to be tricked out of. It declares which origin it acts for, the same way `janux eval` does:

```ts
await fetch(`${baseUrl}/_janux/api/orders.reconcile`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: new URL(baseUrl).origin },
  body: '{}',
});
```

### Why a verified agent is exempt

A Web Bot Auth caller ([`agents`](/docs/guide/agent-and-copilot)) is cross-site *by nature* — it is somebody else's crawler or assistant, arriving from its own infrastructure — so the origin rules above would block every legitimate agent. It is exempt, and the reason it can be is that it is **not the same kind of caller**:

|  | Verified agent | A victim's browser |
|---|---|---|
| What it proves | Possession of an allowlisted private key, signed over *this* request | That some browser, somewhere, holds a cookie |
| Who chose to send it | The agent's operator | The attacker's page |
| Can an attacker's page reproduce it? | No — it cannot sign | Yes, that *is* the attack |

So the exemption cannot be borrowed. Only the signature counts: `x-janux-origin: agent` is a free-to-type hint about which guard rules apply, never a claim of identity, and a signature that fails to verify buys nothing — the request is refused as forgery.

`/_janux/mcp` sits outside the check for the same reason: external MCP clients are cross-site by definition and authenticate with a bearer token ([`mcpAuth`](/docs/recipes/external-mcp-clients)), not with an ambient cookie. There is no browser to trick into sending a credential it holds.

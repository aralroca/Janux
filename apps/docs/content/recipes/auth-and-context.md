---
title: Auth and request context
description: "Identity flows through a Janux app in ctx: built once per request, injected everywhere it is needed, and never a global. Sessions with batteries, and per-agent authorization on top."
---

# Auth and request context

`ctx` is how identity flows through Janux: built once per request, injected everywhere, never global.

Janux is **not an auth provider** and will not become one. What it ships is the two things every app has to build around one — a session cookie that is signed, expiring and rotating, and an authorization model the invocation pipeline enforces for you — plus the seams to plug your own provider into both.

## Building ctx

`src/ctx.ts` is the convention: default-export a function of the request and every route, intent, source and `api()` receives what it returns.

```ts title="src/ctx.ts"
import type { CtxBag } from '@janux/server';

/** Your allowlisted agents, by Web Bot Auth key id, and what each may do. */
const AGENT_SCOPES: Record<string, string[]> = { 'partner-agent-key-thumbprint': ['orders:read'] };

export default function ctxFor(req: Request, { session, agent }: CtxBag) {
  const user = session as { userId: string; scopes: string[] } | undefined;

  return {
    userId: user?.userId,
    role: user ? 'member' : 'guest',
    scopes: user?.scopes,
    // What this agent may spend of that grant — never more (see below).
    agent: agent?.verified ? { scopes: AGENT_SCOPES[agent.keyId!] } : undefined,
  };
}
```

The second argument is what the framework already verified, so `ctxFor` never verifies it twice: `session` is the payload of the signed session cookie (when the app has a [session store](#sessions-with-batteries-included)), and `agent` is the Web Bot Auth identity — `null` when the request carried no signature.

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

## Sessions, with batteries included

`createSessionStore` is the cookie half of auth — the part every app rewrites and half of them get wrong. It authenticates nobody: you call `issue()` once *your* provider has decided who this is.

```ts title="src/session.ts"
import { createSessionStore } from '@janux/server';

export default createSessionStore<{ userId: string; scopes: string[] }>({
  secret: process.env.SESSION_SECRET!,
});
```

`src/session.ts` is the convention, like `src/ctx.ts`. Your login route issues, your logout route clears:

```ts
import sessions from '../session';

export async function POST(req: Request) {
  const user = await myProvider.verify(await req.formData());

  return new Response(null, {
    status: 303,
    headers: { location: '/', 'set-cookie': sessions.issue({ userId: user.id, scopes: user.scopes }) },
  });
}
```

Three properties, and the third is the one apps skip:

- **Signed.** The payload is data your server minted, not data the browser sent. Signed, *not encrypted* — put an id and a grant in it, never a secret.
- **Expiring**, absolutely. A cookie past its window is not a session however valid its signature.
- **Rotating.** Past `rotateAfterMs` (default: half the TTL) the value on the wire is replaced automatically — the server appends the renewed `Set-Cookie` to whatever response the request produced, so a copy lifted from a log, a proxy or a backup stops working, and the user never notices. `issue()` again on privilege change is the other half: a fresh value is what defeats session fixation.

Nothing is stored server-side, which is the trade: no revocation list, and a replaced cookie remains valid until its own expiry. Shorten `ttlMs` if that matters more to you than statelessness.

Two smaller consequences worth knowing:

- The response that carries a renewal is **`private, no-store`**, whatever the route's [cache policy](/docs/guide/http-cache) said — it holds a credential now, so a CDN in front must not keep it for the next visitor.
- A [`confirm` proposal](/docs/guide/intents-and-guards) is bound to the credentials its browser held when it was parked. A rotation landing inside a proposal's ten-minute window therefore refuses the approval (`403`, the same answer a foreign session gets) and the human simply asks again — it fails closed, never open.

### It mints no CSRF token, on purpose

A session cookie is an ambient credential, and the forgery question — *which page told the browser to send it?* — is [already answered once](#cross-site-requests) for the whole `/_janux/*` invocation surface, in the pipeline, before any handler runs. A second mechanism here would be a second thing to get wrong, not a second defence. `SameSite=Lax` is set anyway, as hygiene rather than as the guarantee.

## Scopes: permissions, not just identity

A guard asks *may this origin proceed?* — governance over the agent surface. A scope asks *was this caller granted the capability at all?* — authorization over the credential. They are different questions, so scopes bind human calls too.

Declare them on the tool, never in `run()`:

```ts
export const refund = api({
  description: 'Refund an order',
  scopes: ['orders:write'],
  run: ({ input }) => payments.refund(input.orderId),
});
```

```ts
empty: intent({ description: 'Empty the cart', scopes: ['cart:write'], run: ({ state }) => (state.items = []) }),
```

The grant lives on `ctx`, and there are exactly two places it comes from:

| On `ctx` | Means | Absent means |
|---|---|---|
| `scopes` | What this **credential** grants — a session cookie, a bearer token, an OIDC `scope` claim | **Nothing.** A tool that declares scopes is unreachable until you grant them |
| `agent.scopes` | How much of that grant the **agent acting for it** may spend | The agent inherits the session's grant unchanged |

The effective grant is the **intersection**, so an agent can never out-rank the session it acts for. "The agent acts as the user" stops being a promise in a document and becomes arithmetic no app code can get wrong.

### Enforced twice, because invisible is not protected

A tool outside the grant is **absent** from every listing — the page manifest, `/_janux/manifest`, the hosted MCP `tools/list`, the MCP landing page, `llms.txt` — *and* **refused** by the invocation pipeline. Both, always, and the second is not optional at the transport:

```bash
# Out of scope. Not in the manifest, and not callable either:
curl -X POST https://your.app/_janux/api/orders.refund -H 'origin: https://your.app' -d '{}'
# → 403 {"ok":false,"error":"Error: Tool \"orders.refund\" is not available"}
```

Dropping `x-janux-origin: agent` buys nothing: that header is a hint about which *guard* rules apply, never a claim of identity, so the scope check ignores it. Listing a tool and refusing it at call time would hand an agent the name, the description and the input schema of something it may never call — which is exactly what the check exists to prevent. Refusing it without hiding it would leave the inventory public. The conformance corpus asserts all of it, on all three doors: [`security/tool-scopes.cases.ts`](https://github.com/aralroca/janux/blob/main/packages/conformance/security/tool-scopes.cases.ts).

> **Note:** intents live on both sides of the wire, so their scopes are evaluated with whatever `ctx` the pipeline has: the request's on the server, and in the browser the one the page booted with (`boot({ ctx })`). Server-authoritative authorization belongs on `api()`, whose `ctx` is always the request's.

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

Agent invocations run under the **end user's ctx**, never a service identity. The copilot can do at most what its human can — guards then narrow further, and `agent.scopes` narrows again. There is no privilege escalation path through the agent endpoint: the effective grant is an intersection, so an agent that claims more than its session holds still gets the session's.

> **Warning:** `x-janux-origin` distinguishes agent from human for *guard semantics* — it is not authentication. A caller lying about being human gains nothing your `ctxFor` didn't already grant them, and nothing a scope refuses either: the scope check ignores the header.

## Plugging in OAuth / OIDC

Janux builds no provider — you bring Auth0, Keycloak, Okta, WorkOS, Clerk, a `openid-client` of your own. Three seams is all it takes, and none of them is a Janux-shaped abstraction over your provider.

**1. The callback issues a session.** Your provider's redirect lands on an ordinary [HTTP handler](/docs/guide/http-handlers). Exchange the code, then hand the claims you actually need to `sessions.issue()` — the ID token itself does not belong in a cookie:

```ts title="src/api/auth/callback.ts"
import sessions from '../../session';
import { client } from '../../oidc';

export async function GET(req: Request) {
  const tokens = await client.callback(new URL(req.url));
  const claims = tokens.claims();

  return new Response(null, {
    status: 303,
    headers: {
      location: '/',
      // A fresh cookie value on every login: this is the fixation defence.
      'set-cookie': sessions.issue({ userId: claims.sub, scopes: String(tokens.scope ?? '').split(' ').filter(Boolean) }),
    },
  });
}
```

**2. `ctxFor` turns the session into a grant.** The OIDC `scope` string is already a space-separated list of exactly what the user consented to, so it maps onto `ctx.scopes` unchanged — that is the whole integration. Map roles or a `permissions` claim the same way if your provider issues those instead.

**3. Machine callers bring their own token.** An external MCP client or a service-to-service caller has no cookie, so its grant comes from the bearer token — read it in `ctxFor` like any other credential, and validate it wherever you validate tokens:

```ts title="src/ctx.ts"
export default async function ctxFor(req: Request, { session, agent }: CtxBag) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const token = bearer ? await client.introspect(bearer) : undefined;
  const user = session as { userId: string; scopes: string[] } | undefined;

  return {
    userId: user?.userId ?? token?.sub,
    scopes: user?.scopes ?? token?.scope?.split(' '),
    agent: agent?.verified ? { scopes: AGENT_SCOPES[agent.keyId!] } : undefined,
  };
}
```

For `/_janux/mcp` specifically, [`mcpAuth`](/docs/recipes/external-mcp-clients) is the door: it verifies the bearer and answers `401` with `WWW-Authenticate` (and a `resource_metadata` URL) before any tool is listed, which is what an OAuth-aware MCP client expects. The grant still arrives through `ctx.scopes`, so the same tool is filtered and refused identically whether the caller came through the browser, the bridge or MCP.

**Refresh tokens stay server-side.** The session cookie holds an id and a grant; if you need to call the provider on the user's behalf later, keep the refresh token in your own store keyed by `userId`, not in the cookie — the payload is signed, not encrypted.

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

---
title: Content Security Policy
description: "Deploy without 'unsafe-inline'. `csp: true` mints a nonce per request and stamps it on every inline script and style Janux emits — shell, renderer, suspense boundaries and SPA navigations included."
---

# Content Security Policy

A strict CSP is the one mitigation that turns "we found an XSS" into "we found a bug". It works by refusing every inline script the page did not vouch for — which is exactly why frameworks that ship inline bootstrap code usually make you keep `'unsafe-inline'`, and a policy with `'unsafe-inline'` in `script-src` stops any XSS at all.

Janux nonces everything it emits, so you don't have to choose.

```ts
import { createJanuxServer } from '@janux/server';

export const server = createJanuxServer({
  routesDir: 'src/routes',
  csp: true,
});
```

Or, the usual place — `janux.config.ts`:

```ts
import { defineConfig } from 'janux';

export default defineConfig({ csp: true });
```

That is the whole setup. Every response now gets a fresh 128-bit nonce, every inline script and style the framework writes carries it, and the response ships:

```
Content-Security-Policy: script-src 'nonce-{random}' 'strict-dynamic'; object-src 'none'; base-uri 'none'
```

## What gets nonced

All of it — this is a framework guarantee, tested by sweeping the emitted document rather than by listing the tags we remember writing:

| Tag | Why it exists |
|---|---|
| `<script type="application/janux+state">` | The resume payload: the state each island resumes from |
| `<script>window.__JANUX_ISLANDS__=…</script>` | The island → module map the client bootstrap reads |
| `<script type="module" src="/client.js">` | The runtime itself (`'strict-dynamic'` covers what it imports) |
| `<script type="speculationrules">` | Prefetch rules, and the narrowed copy the client swaps in after boot |
| `<script type="application/janux+config">`, `+i18n` | Navigation config and the i18n payload |
| `<style id="jx-style-N">` | Your inlined stylesheet (`inlineStyles`) |
| `<script key="jx-query:N">` | The [query hydration](/docs/guide/data-cache) payload, one per streamed chunk |
| `self.jx$u=…`, `jx$u(…)` | The [suspense](/docs/guide/ssr-and-resumability) unsuspense runtime and each boundary's swap call |
| `<script type="application/ld+json">`, `meta.head` script/style | JSON-LD and a route's own head tags |
| `<script>` / `<style>` written in your JSX | Your own tags — a theme-init snippet, a critical-CSS block. Declare `nonce` yourself and yours wins |

Nothing runs `eval` or `new Function`, so you never need `'unsafe-eval'`.

This is a property of the framework, not of a runtime: the nonce is minted and stamped inside `createJanuxServer`, so it behaves identically on Bun, on [Node 24+](/docs/recipes/deploying) via `@janux/node`, and on Vercel. An adapter only copies the response's headers across.

### Client-side navigation

SPA navigation is the part that is easy to get wrong, so it is worth knowing what happens. Every response carries a **different** nonce, but the policy governing the live document is the one that arrived with the *first* one. A script the navigation diff brings in therefore carries a nonce this document would refuse.

The runtime captures its own nonce at boot and stamps that on anything it re-creates — scripts a navigated page brings, the narrowed speculation rules, the agent-glow stylesheet. You do not configure this; it is why fresh loads and SPA navigations both come out clean.

## Bringing your own nonce or policy

`csp: true` is shorthand. The long form is two independent knobs:

```ts
import { createJanuxServer, strictPolicy } from '@janux/server';

export const server = createJanuxServer({
  routesDir: 'src/routes',
  csp: {
    // A proxy already minted one and put it in a request header.
    nonce: (req) => req.headers.get('x-nonce') ?? '',
    // Add to the recommended policy instead of replacing it.
    header: (nonce) => `${strictPolicy(nonce)}; style-src 'nonce-${nonce}'; connect-src 'self'`,
  },
});
```

Omit `header` entirely and Janux nonces the document but sends no header — the right shape when a CDN, a reverse proxy or your own [middleware](/docs/reference/server-api) owns the header. **A nonce is only worth something if it is unpredictable and used once**, so if you take over minting, mint per request.

Two things to get right if you read the nonce off a request header:

- **The proxy must overwrite it, never merely add it.** A client-supplied `x-nonce` that reaches the app is attacker-controlled. Janux refuses any nonce outside the CSP `base64-value` grammar and generates one instead — so directive injection is not possible either way — but a forwarded header still means the attacker chooses your nonce.
- **Do not cache nonced HTML.** A cached page hands every later visitor a nonce the policy no longer names (or, worse, one an attacker has already seen). Janux enforces this for its own [shared response cache](/docs/guide/http-cache) — a nonced document is never stored, whatever the route's `cache` policy says, and it says so once at startup. A CDN in front is yours to configure: send `Cache-Control: no-store` for nonced pages, or cache only where the edge rewrites the nonce per hit.

## Locking down styles too

The default policy deliberately says nothing about `style-src`. Style injection is a far weaker primitive than script injection, and turning it on breaks a common, harmless pattern — so it is opt-in:

```
style-src 'nonce-{random}'
```

Add that only after checking two things:

- **`style={{ … }}` in your JSX** becomes a `style` attribute, which `style-src-attr` governs (falling back to `style-src`). A nonce cannot apply to an attribute, so a page using inline styles needs `style-src-attr 'unsafe-inline'` — much narrower than `'unsafe-inline'` on scripts, but not nothing. Moving those declarations into your stylesheet or [CSS variables](/docs/styles/css-variables) avoids it entirely.
- **Third-party UI mounted through [interop](/docs/guide/interop)** frequently injects its own `<style>` at runtime (styled-components, emotion, chart libraries). Those tags carry no nonce and will be dropped.

## What to add for the rest of the stack

Each of these is opt-in because each costs you something. Add only what your app actually uses.

### The copilot

The embedded agent talks to your own origin (`POST /_janux/agent`), so:

```
connect-src 'self'
```

If you also stream from a model provider **directly from the browser**, add that origin. Prefer not to: routing through `/_janux/agent` keeps both your API key and your CSP simple.

### WebSockets

`'self'` covers a same-host `ws:`/`wss:` connection in current browsers, but engines have been inconsistent about it for years and a dropped socket is a silent failure. Be explicit:

```
connect-src 'self' wss://your-app.example
```

Use `ws://localhost:*` for local development, not in production.

### The local model (WebGPU / Transformers.js)

The heaviest case, because `localLlm()` pulls in Transformers.js → ONNX Runtime Web, which compiles WebAssembly even on the WebGPU path:

```
script-src 'nonce-{random}' 'strict-dynamic' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net
```

- **`'wasm-unsafe-eval'`** — WebAssembly compilation is gated by `script-src`. This permits *only* WebAssembly, not `eval`, which is why it exists as a separate keyword.
- **`worker-src 'self' blob:`** — ONNX Runtime runs inference in workers created from blob URLs. Janux's own [`worker()`](/docs/reference/worker) helper does the same, so add this whenever you use it, model or no model.
- **`connect-src`** — model weights come from `env.remoteHost` (the Hugging Face Hub by default) and the ORT `.wasm` binaries from a CDN. **Self-host both** and this collapses back to `'self'`:

```ts
import { env } from '@huggingface/transformers';

env.remoteHost = 'https://your-app.example/models/';
env.backends.onnx.wasm.wasmPaths = '/ort/';
```

## Static export

`output: "static"` has no server at request time, so there is nothing to mint a nonce or send a header — Janux ignores `csp` there and says so at build time rather than baking a random nonce into every prerendered file, which would look like protection while enforcing nothing.

Set the policy on the host (Netlify `_headers`, Cloudflare Rules, S3+CloudFront response headers). A prerendered page's inline scripts are byte-stable, so `'sha256-…'` hashes are the strict option; `'unsafe-inline'` is the usual pragmatic one.

## Verifying it

Load the app, then check the console — a strict CSP fails loudly, and `Refused to execute inline script` is the whole message. Two checks matter and only one is obvious:

1. **A fresh load.** The page renders and islands respond to clicks.
2. **After an SPA navigation.** Navigate, then interact. This is where a framework that nonces only the first response falls over.

`securitypolicyviolation` is the programmatic version, and worth wiring to your error reporter for a while after rolling this out:

```ts
addEventListener('securitypolicyviolation', (event) => {
  console.error('CSP', event.violatedDirective, event.blockedURI);
});
```

Roll out with `Content-Security-Policy-Report-Only` first if the app has third-party code you do not control — build your own header with `csp.header` and rename it in your proxy. The nonce plumbing is identical either way.

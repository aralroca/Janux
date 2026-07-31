---
title: Project structure
description: "Janux is convention over configuration: every path below is optional and discovered by existence."
---

# Project structure

Janux is convention over configuration: every path below is **optional** and discovered by existence. Create the file and the feature turns on — there is nothing to register.

```
my-app/
  src/
    routes/           # file-system routes: index.tsx → /, orders/[id].tsx → /orders/:id
      _404.tsx        # unmatched URLs (and notFound()) — answered with a 404
      _500.tsx        # a page that threw while rendering — answered with a 500
    components/       # your components (static, islands, stores)
    server/           # *.api.ts — server functions that double as agent tools
    api/              # arbitrary HTTP handlers: src/api/upload.ts → POST /api/upload
    client.ts         # boot({ defs: [...] }) — the client entry
    agent.ts          # defineAgent({...}) — the copilot
    stores.ts         # exported store defs, so SSR can render store-dependent views
    ctx.ts            # (req) => ctx — per-request context: session, tenant, role
    middleware.ts     # runs before routing on every request
    matchers.ts       # custom typed route params: [post=slug]
    i18n.ts           # or src/i18n/index.ts — locales, messages, routing
    styles.css        # the app stylesheet, injected into the HTML shell
  public/
    favicon.svg       # served and linked automatically
  janux.config.ts     # optional: title, output, llms.txt, path overrides
  tsconfig.json
```

## What each convention does

| Path | Turns on | Details |
|---|---|---|
| `src/routes/**` | Routing, layouts (`_layout.tsx`), groups (`(name)/`), dynamic and typed segments | [Navigation](/docs/guide/navigation) |
| `src/routes/_404.tsx`, `_500.tsx` | The pages an unmatched URL and a failed render answer with | [Navigation § Not found & server errors](/docs/guide/navigation) |
| `src/server/*.api.ts` | `api()` RPC endpoints, auto-published as agent tools | [api() as agent tools](/docs/guide/api-rpc) |
| `src/api/**` | Raw HTTP handlers by exported method (`export function POST`) and uploads | [HTTP handlers](/docs/guide/http-handlers) |
| `src/client.ts` | The client runtime (`boot`). Omit it for a zero-JS site | [SSR and resumability](/docs/guide/ssr-and-resumability) |
| `src/agent.ts` | The copilot at `/_janux/agent` + the embedded harness | [The agent and your copilot](/docs/guide/agent-and-copilot) |
| `src/stores.ts` | Server-side store instances per request, so SSR can render views that read them | [Stores](/docs/guide/stores) |
| `src/ctx.ts` | The per-request `ctx` every route, intent, source and `api()` receives | [Auth and request context](/docs/recipes/auth-and-context) |
| `src/middleware.ts` | A request hook before routing — redirects, auth gates, locale hardening | [Navigation § Middleware](/docs/guide/navigation) |
| `src/matchers.ts` | Custom param matchers (each export is `(value: string) => boolean`) | [Navigation § The route tree](/docs/guide/navigation) |
| `src/i18n.ts` | Locale-prefixed routing, typed `t()`, page-scoped client messages | [i18n](/docs/guide/i18n) |
| `src/styles.css` | Stylesheet link in the HTML shell — `.scss`, `.sass` and `.less` are resolved too, and always emitted as `/styles.css` | [Styles](/docs/styles/overview) |
| `public/favicon.svg` | Favicon link in the shell | — |

## What the starter ships

`bun create janux my-app` gives you the smallest app that shows both faces:

- `src/components/Counter.tsx` — a bifacial island: schema state, an intent with a description, a view. This is the piece agents can read *and* drive.
- `src/components/AgentPanel.tsx` — the copilot UI, talking to `/_janux/agent`.
- `src/routes/index.tsx` — the page, with `meta` for title and description.
- `src/routes/_404.tsx` and `_500.tsx` — the pages a bad URL and a broken render answer with, from the first run.
- `src/client.ts` — `boot({ defs: [Counter] })`.
- `src/components/Counter.test.ts` — a unit test driving intents through the real pipeline.

## Overriding the layout

`janux.config.ts` takes the same options as the Vite plugin:

```ts title="janux.config.ts"
import { defineConfig } from 'janux';

export default defineConfig({
  title: 'My app',
  output: 'static',              // 'bun' (default) | 'static'
  routesDir: 'src/pages',        // if you dislike the defaults
  serverDir: 'src/rpc',
  clientEntry: 'src/entry.ts',
  llmsTxt: { title: 'My app', description: 'What it does' },
});
```

Edits are picked up live in dev. A `"janux"` field in `package.json` still works as a fallback, but `janux.config.ts` wins.

Next: [Mental model](/docs/getting-started/mental-model) · [Editor setup](/docs/getting-started/editor-setup)

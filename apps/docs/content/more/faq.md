# FAQ

## Do I need an AI API key to use Janux?

No. The framework is a complete SSR/islands framework without any key. The copilot endpoint answers a setup card until you set `JANUX_MODEL` or a provider key — nothing else changes.

## Does every visitor pay for an LLM?

Only if they use the copilot. Pages, islands, api() calls — none of it touches a model. The agent runs per copilot conversation, server-side, under your key and your `maxTurns` cap.

## Why can't I mutate state outside `run()`?

Because every mutation being a named, validated, guard-checked intent is what makes the agent surface trustworthy — and what gives you audit trails, proposals and browserless tests for free. It's the framework's one big constraint; everything else falls out of it.

## Can an agent approve its own proposal?

No. `approve` endpoints/bridges execute a stored closure exactly once, and approval affordances live in your UI for humans. Give your copilot chrome human-only intents (`guard: 'forbidden'`) so the model can't even see them.

## What happens if my component throws during resume?

The island fails in isolation — other islands and the static page keep working. Errors surface as `janux:error` DOM events.

## Is `x-janux-origin` spoofable?

Yes, and that's fine: `human` is the default and most-privileged origin, so lying about it grants nothing. Real authentication belongs in [`src/ctx.ts`](/docs/recipes/auth-and-context); guards govern *agent* behavior, not network trust.

## How do I do i18n / dark mode / router transitions?

**i18n is built in**: a `src/i18n.ts` config turns on locale-prefixed routing (`/en`, `/es`), typed `t()` with plurals and interpolation, locale detection with a `JANUX_LOCALE` cookie, and page-scoped client messages — only the keys a page's islands use are shipped ([i18n](/docs/guide/i18n)). Dark mode: a store (`theme`) read by islands + CSS. Client-side route transitions: built in — SPA navigation is on by default (diffed HTML over the Navigation API), with `persist` islands and surviving app-scope stores. See [SPA navigation](/docs/guide/navigation#spa-navigation).

## Why Bun?

`janux start` executes TSX directly — no server build, no transpile step drift. Dev uses Vite for HMR and the client pipeline. You can still deploy anywhere a container runs.

## Can I deploy without a server?

Yes — set `output: "static"` in your app config and `janux build` prerenders every page (dynamic routes enumerated by `staticParams`) plus `llms.txt` into `dist/client`, ready for any static host. You keep SSR HTML and islands; you give up everything under `/_janux/*` — api tools, manifest, proposals, copilot. See [Deploying → Static export](/docs/recipes/deploying).

## Where's the memory / guardrails / RAG story?

In `defineAgent({ harness })`, opt-in and provider-direct — no extra runtime to adopt:

| Field | What it adds |
|---|---|
| `memory` | Thread-aware turns: history read from storage, replies remembered ([agent memory](/docs/reference/agent-memory)) |
| `processors` | A guardrail pipeline before every turn; aborting returns a typed refusal ([guardrails](/docs/reference/agent-guardrails)) |
| `rateLimit` + `identityFor` | Per-caller limits and thread ownership ([rate limit](/docs/reference/agent-rate-limit)) |

Durable [workflows](/docs/reference/agent-workflows), [attachments](/docs/reference/agent-attachments) and [outbound MCP clients](/docs/reference/agent-mcp-client) sit alongside it. RAG is not a framework feature: give the agent retrieval **tools** (`api()` functions over your index) and it retrieves — the docs site you're reading does exactly that.

## Is this production-ready?

It's a young v0.x with an unusually strong test story (the guarantees are asserted, not promised). Ship a side project; read the roadmap before betting the company.

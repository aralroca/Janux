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

Yes, and that's fine: `human` is the default and most-privileged origin, so lying about it grants nothing. Real authentication belongs in `ctxFor`; guards govern *agent* behavior, not network trust.

## How do I do i18n / dark mode / router transitions?

i18n: your strings, your call — state or ctx. Dark mode: a store (`theme`) read by islands + CSS. Client-side route transitions: not yet — navigation is full-page (fast: pages are tiny). On the roadmap.

## Why Bun?

`janux start` executes TSX directly — no server build, no transpile step drift. Dev uses Vite for HMR and the client pipeline. You can still deploy anywhere a container runs.

## Where's the Mastra/memory/RAG story?

`defineAgent` is forward-compatible with a richer runtime behind the same surface (see [architecture & roadmap](/docs/guide/architecture-and-roadmap)). Today's loop is deliberately small and provider-direct.

## Is this production-ready?

It's a young v0.x with an unusually strong test story (the guarantees are asserted, not promised). Ship a side project; read the roadmap before betting the company.

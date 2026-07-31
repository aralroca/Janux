---
title: Observability with Sentry
description: Wire instrumentation.ts to Sentry via OpenTelemetry — spans, errors and PII redaction — in one register().
---
# Observability with Sentry

Sentry is an OpenTelemetry backend, so wiring it up is the same two lines that wire up Datadog, Grafana or a bare OTLP collector. What is *not* the same is what Janux puts in the trace: the guard that decided, and whether a human or an agent was asking.

## Install

```bash
bun add @sentry/node @opentelemetry/api
```

`@opentelemetry/api` is not a dependency of Janux — the framework describes a tracer structurally, so an app that never instruments never installs an SDK. Here you are instrumenting, so you install it.

## src/instrumentation.ts

The convention: Janux imports this file and awaits `register()` **before the server serves its first request**, in `janux dev` and `janux start` alike.

```ts
import { otelTracer, setOnError, setPiiFilter, setTracer, defaultPiiFilter } from 'janux/observability';
import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';

export async function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    skipOpenTelemetrySetup: false,
  });

  setTracer(otelTracer(trace.getTracer('janux')));

  // The other half of _500.tsx: the page is what the visitor sees, this is
  // what you see. Warnings are expected conditions — keep them out of Issues.
  setOnError((error, info) => {
    if (info.level === 'warning') return Sentry.logger.warn(String(error), { ...info });

    Sentry.captureException(error, { tags: { phase: info.phase, origin: info.origin }, extra: { ...info } });
  });

  // Your own identifiers, on top of the default redaction.
  setPiiFilter((value) => defaultPiiFilter(value).replace(/cus_\w+/g, '[customer]'));
}
```

That is the whole integration. No `Sentry.wrapHandler`, no per-route middleware: the spans come from the framework's own pipelines, which is why they know things a generic HTTP instrumentation cannot.

If Sentry is down, misconfigured, or its SDK throws on `init`, **the app still serves**. Fail-open is a hard constraint, not a best effort — a page that already rendered is never turned into a 500 by an exporter that failed while flushing.

## Pricing the agent

Token counts ride on every model turn automatically. The price does not — Janux ships no price table, because a bundled one is wrong the week after it is written:

```ts
import { defineAgent } from '@janux/agent';

export default defineAgent({
  model: 'anthropic/claude-fable-5',
  cost: { input: 3, output: 15 },   // USD per MILLION tokens
});
```

That puts `janux.cost.usd` on each `chat {model}` span, alongside the `gen_ai.usage.*` counts.

## The trace you get

An agent asks to check out. The tool is guarded `confirm`, so nothing runs: a proposal is parked, the human approves it in the UI, and the call executes. Three requests, one story, tied together by `janux.proposal.id`:

```
janux.request                        GET /                       28ms
  http.request.method = GET
  janux.route         = /
└─ janux.render                                                  26ms
   │  janux.route  = /
   └─ janux.island                                                9ms
         janux.island = cart

janux.request                        POST /_janux/agent         1.4s
├─ janux.render                                                   7ms
│  │  janux.route = /            ← the turn renders the page to know its tools
│  └─ janux.island                                                3ms
│        janux.island = cart
└─ invoke_agent janux                                            1.4s
   │  gen_ai.operation.name = invoke_agent
   │  gen_ai.provider.name  = anthropic
   ├─ chat claude-fable-5                                        1.1s
   │     gen_ai.operation.name      = chat
   │     gen_ai.request.model       = claude-fable-5
   │     gen_ai.response.model      = claude-fable-5-20260501
   │     gen_ai.usage.input_tokens  = 1200
   │     gen_ai.usage.output_tokens = 300
   │     janux.cost.usd             = 0.0081
   └─ janux.api                                                    2ms
         janux.intent      = api.shop.checkout
         janux.guard       = confirm          ← nothing ran
         janux.origin      = agent
         janux.proposal.id = prop_api_9f2c…

janux.request                        POST /_janux/approve        34ms
└─ janux.proposal.approve                                        33ms
   │  janux.origin      = human               ← the human said yes
   │  janux.proposal.id = prop_api_9f2c…
   └─ janux.api.execute                                          31ms
         janux.intent      = api.shop.checkout
         janux.origin      = agent            ← still on the agent's behalf
         janux.proposal.id = prop_api_9f2c…
```

Read it top to bottom and you have the answer to the question every audit asks: *who asked for this, what stopped it, who let it through, and what did it cost?* The `origin` split on the last two spans is the load-bearing detail — the approval is human, the execution is still the agent's call, and a trace that folded them together could not tell you the difference.

The exact span names, attributes and their cardinality rules are in [the observability reference](/docs/reference/observability-api).

## Querying it

Because `janux.route` is the route **pattern** and never the URL, latency groups the way you want it to:

- `janux.guard = confirm AND janux.origin = agent` — every time an agent asked for something dangerous.
- `janux.proposal.id = X` — the full life of one proposal, across the requests that proposed and approved it.
- `span.name = "janux.render" GROUP BY janux.route` — SSR cost per route, not per visitor.
- `sum(janux.cost.usd) GROUP BY gen_ai.request.model` — what the copilot spent this week.

## Sampling and cost

`tracesSampleRate` is Sentry's, and it applies to everything — including the agentic spans that are the reason you are here. A common shape is to sample page traffic lightly and keep every guarded invocation, using Sentry's `tracesSampler` and the fact that only some spans carry `janux.guard`.

An uninstrumented app is unaffected either way: with no `instrumentation.ts`, no tracer is registered and the framework never builds a single attribute object.

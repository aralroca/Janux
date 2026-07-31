# Observability API

Everything importable from `janux/observability`, plus the `instrumentation.ts` convention that turns it on.

Nothing here runs until an app registers something. With no tracer and no error handler, every call in this module is a branch on a module-level `undefined` — an uninstrumented app pays nothing, which is the constraint the whole design is built around.

For a working setup, see [the Sentry recipe](/docs/recipes/sentry).

## instrumentation.ts

`src/instrumentation.ts` is loaded and its `register()` awaited **before the server serves its first request** — in `janux dev` and in `janux start` alike. That ordering is the point: an SDK that patches globals has to do it before the code it means to observe is loaded.

```ts
// src/instrumentation.ts
import { otelTracer, setOnError, setTracer } from 'janux/observability';
import { trace } from '@opentelemetry/api';

export async function register() {
  await startYourSdk();
  setTracer(otelTracer(trace.getTracer('janux')));
  setOnError((error, info) => reportSomewhere(error, info));
}
```

`register()` may be async, and it is awaited. A `register()` that throws — or a file that fails to import, or one that exports no `register()` — is reported and the app **serves anyway**: observability is how you find out the app is broken, so it must never be the reason it is.

## setTracer(tracer)

Registers the process-wide tracer. Pass `undefined` to turn tracing off again.

```ts
import { setTracer } from 'janux/observability';

setTracer({
  span: async (name, attributes, run) => {
    console.log(name, attributes);

    return run({ setAttributes: () => {}, recordError: () => {} });
  },
});
```

A `JanuxTracer` has one method. It is callback-shaped rather than start/end so that parenting is the tracer's job: `otelTracer` maps it straight onto OpenTelemetry's `startActiveSpan`, and the trace gets its shape from OTel's context propagation rather than from bookkeeping in Janux.

## isTracing()

`true` once a tracer is registered. The framework uses it to skip work that only a trace would consume (resolving a route pattern, for one); an app rarely needs it.

## withSpan(name, attributes, run)

Runs `run` inside a span, or just runs it when nothing is registered. `attributes` is a **thunk** precisely so an uninstrumented app never builds an object it would throw away.

```ts
import { withSpan } from 'janux/observability';

export const importOrders = api({
  description: 'Bulk import',
  run: ({ input }) => withSpan('shop.import', () => ({ 'shop.rows': input.rows.length }), async (span) => {
    const result = await load(input.rows);

    span.setAttributes({ 'shop.skipped': result.skipped });

    return result;
  }),
});
```

Fail-open, in both directions: a tracer that throws before the work runs is bypassed (the work still runs, once), and a tracer that throws *after* the work succeeded does not turn a served page into a 500. An error from `run` is recorded on the span and rethrown unchanged.

## otelTracer(tracer)

Wraps an OpenTelemetry tracer as a `JanuxTracer`. Anything that speaks OTLP — Sentry, Datadog, Grafana, a bare collector — is reached this way.

```ts
import { otelTracer, setTracer } from 'janux/observability';
import { trace } from '@opentelemetry/api';

setTracer(otelTracer(trace.getTracer('janux')));
```

`@opentelemetry/api` is **not** a dependency of Janux. The adapter describes the tracer structurally, so an app that never instruments never installs an SDK, and one that does already has the real package for its exporter.

## The janux.* attributes

The set no other framework can emit, because no other framework has the answers.

| Attribute | On | Value |
|---|---|---|
| `janux.route` | `janux.request`, `janux.render` | The route **pattern** (`/orders/[id]`), never the URL — a span per order id is a cardinality bomb |
| `janux.island` | `janux.island` | The island's `name` |
| `janux.intent` | `janux.intent`, `janux.api` | The tool name, exactly as the audit trail writes it: `cart.checkout`, `api.shop.checkout` |
| `janux.guard` | `janux.intent`, `janux.api` | The **resolved** guard: `auto`, `confirm` or `forbidden` |
| `janux.origin` | `janux.intent`, `janux.api` | `human` or `agent` |
| `janux.proposal.id` | proposal spans | Ties an agent's request to the human approval that ran it, across two requests |
| `janux.cost.usd` | `chat {model}` | What the turn cost, when the agent declared its prices |

### The spans

| Span | Opened by |
|---|---|
| `janux.request` | Every request, before routing |
| `janux.render` | The SSR document render |
| `janux.island` | Each island. A suspended island's span covers what it contributed to *this* flush — its fallback; the deferred content arrives on its own chunk, after the span closed |
| `janux.intent` | The component invocation pipeline |
| `janux.intent.execute` | The approved run of a proposed intent |
| `janux.api` | The `api()` invocation pipeline, and the proposal an agent's `confirm` call parks |
| `janux.api.execute` | The approved run of a proposed `api()` call |
| `janux.proposal.approve` | `POST /_janux/approve` — the human act |
| `invoke_agent janux` | One agent turn: every round and every tool hangs off it |
| `chat {model}` | One round of the loop |

### GenAI semantic conventions

The agent spans follow the [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/), so a Janux copilot lands in the same dashboards as every other instrumented LLM caller: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` and `error.type`.

`gen_ai.input.messages` and `gen_ai.output.messages` are **not** emitted. They are opt-in in the spec and stay off here: the transcript is the one field guaranteed to contain whatever the user typed.

Token cost comes from `defineAgent({ cost })`, in USD per **million** tokens — the unit every provider publishes:

```ts
import { defineAgent } from '@janux/agent';

export default defineAgent({
  model: 'anthropic/claude-fable-5',
  cost: { input: 3, output: 15 },
});
```

Janux ships no price table. A bundled one is wrong the week after it is written.

## setOnError(handler)

The app's global error sink — the other half of `_500.tsx`. That page is what the visitor sees; this is what the operator sees, and it fires for the failures no page can catch.

```ts
import { setOnError } from 'janux/observability';

setOnError((error, info) => {
  if (info.level === 'warning') return logger.warn(info.phase, error);
  logger.error(info.phase, error, { route: info.route, intent: info.intent, origin: info.origin });
});
```

`info.phase` is where the framework was: `ssr` (a page render), `invocation` (the pipeline every intent and `api()` call goes through), `agent`, `instrumentation` (the app's own `instrumentation.ts`) or `observability` (the reporting machinery itself — a broken exporter). `info.level` separates a handled warning from a failure.

A refusal is **not** an error. `invalid_input`, `forbidden` and the rest of `JanuxIntentError` are the pipeline working; routing them here would drown the signal in every mistyped agent call.

One failure can produce two reports, on purpose: an `api()` that throws during SSR is reported once by the invocation pipeline (which knows *which tool* broke) and once by the render (which knows *which page* died with it). They are different facts, and an operator wants both.

With no handler registered, failures go to the console exactly as they always did. A handler that throws is contained — reporting a failure must never become a second failure.

## reportError(error, info) / reportWarning(message, info)

The framework's own reporting calls, exported so app code and adapters can use the same channel instead of a stray `console.warn`.

```ts
import { reportWarning } from 'janux/observability';

if (!queue.durable) reportWarning('running with an in-memory queue', { phase: 'invocation' });
```

## setPiiFilter(filter)

Span attributes leave the process. Route paths carry ids, error messages quote the input that broke, and an exporter ships all of it to a third party — so **every string attribute is scrubbed on the way out, by default**.

The default filter is deliberately conservative, because destroying signal costs debuggability:

- emails → `[email]`
- phone numbers only in international format (leading `+`) → `[phone]`; bare digit runs (ids, timestamps, amounts) are left alone
- `data:` URLs and long base64 runs → a length marker

```ts
import { defaultPiiFilter, setPiiFilter } from 'janux/observability';

setPiiFilter((value) => defaultPiiFilter(value).replace(/cus_\w+/g, '[customer]'));
```

Pass `undefined` to restore the default. This one fails **closed**, unlike everything else here: a filter that throws redacts the value rather than letting the raw one through, because the raw value is the thing being protected.

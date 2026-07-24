# Error handling

A failure shows up in exactly three places in a Janux app: the **intent pipeline** (a typed `JanuxIntentError`), the **HTTP envelope** of an `api()` call, and the client runtime's **`janux:error`** DOM event. Each one has an owner — the intent, the caller, and a global reporter.

```tsx
import { component, intent, int, schema, str } from 'janux';
import { chargeCard } from '../server/payments.api';

export const Payment = component({
  name: 'payment',
  description: 'Charges the saved card',
  state: schema({ status: str().default('idle'), message: str().default('') }),
  intents: {
    charge: intent({
      description: 'Charge the saved card',
      input: schema({ cents: int().min(1) }),
      ready: ({ state }) => state.status !== 'charging',
      run: async ({ state, input }) => {
        state.status = 'charging';
        try {
          await chargeCard({ cents: input.cents });
          state.status = 'paid';
        } catch (error) {
          state.status = 'failed';
          state.message = 'We could not charge your card.';
          throw error;
        }
      },
    }),
  },
  view: ({ state }) => (
    <p class={state.status}>{state.status === 'failed' ? state.message : state.status}</p>
  ),
});
```

Two decisions in that `catch` are the whole recipe: **model the failure in state** (the view has something to render) and **rethrow** (the caller, the audit trail and the agent all learn it failed). Swallowing the error leaves the UI honest and everything else blind.

## Errors the pipeline raises for you

Before `run` executes, the pipeline can reject on its own with a `JanuxIntentError` carrying a `code`:

| `code` | Raised when | `run` executed? |
|---|---|---|
| `invalid_input` | the intent's `input` schema rejected the payload | no |
| `not_ready` | `ready(bag)` returned `false` | no |
| `forbidden` | an **agent** called an intent whose guard resolves to `'forbidden'` | no |

```ts
import { JanuxIntentError } from 'janux';

try {
  await instance.intents.charge({ cents: 0 });
} catch (error) {
  if (error instanceof JanuxIntentError && error.code === 'invalid_input') showFieldErrors(error.message);
}
```

`forbidden` is about agents, not permissions in general: a human click on a `guard: 'forbidden'` intent runs normally — the guard describes what the copilot may do unattended. Real authorization belongs in `run` (or in the `api()` it calls), where `ctx` is available. See [intents and guards](/docs/guide/intents-and-guards).

## State written before the throw stays written

There is no transaction around `run`. The `state.status = 'charging'` above survives the failure, which is exactly why the `catch` sets `'failed'` explicitly. If you'd rather not show an intermediate state at all, compute first and assign once:

```ts
run: async ({ state, input }) => {
  const receipt = await chargeCard({ cents: input.cents }); // throws before any write

  state.status = 'paid';
  state.message = `Receipt ${receipt.id}`;
},
```

## Every failure is audited

`onAudit` receives the same entry a success would produce, with `ok: false` and `error` stringified — including validation failures, where `run` never ran:

```ts
onAudit: (entry) => {
  if (!entry.ok) report(`${entry.tool} failed: ${entry.error}`);
},
```

That's the hook for Sentry, an audit log, or a compliance trail; it fires for human clicks and agent calls alike. See [`ServerOptions.onAudit`](/docs/reference/server-api).

## The HTTP envelope of an `api()`

Every `api()` response is `{ ok: true, result }` or `{ ok: false, error }`, and the status maps the error:

| Status | Cause |
|---|---|
| `400` | input rejected by the api's `input` schema |
| `403` | an agent called an api whose guard resolves to `'forbidden'` (or Web Bot Auth is required and missing) |
| `404` | no api with that name |
| `500` | anything `run` threw |

The generated client stub turns a non-`ok` envelope into a thrown `Error` whose message is the server's `error` string — the `code` does **not** survive the wire:

```ts
try {
  await chargeCard({ cents: 500 });
} catch (error) {
  // error.message is the server text; error.code is undefined
}
```

So when the client has to *branch* on a failure, don't throw it: return it. An api that answers `{ status: 'declined', reason }` keeps the decision typed on both sides, and keeps `500` for what it means — a bug.

## `janux:error`: the client runtime's channel

The runtime never throws into a void. When something fails outside a call you made — a corrupt state snapshot, an island that fails to mount, a foreign (React) root, an invalid i18n payload, a failed SPA navigation — it dispatches a `janux:error` event on `document`:

```ts
document.addEventListener('janux:error', (event) => {
  report((event as CustomEvent<string>).detail);
});
```

`detail` is a **string** (`String(error)`), not an `Error`: there's no stack to forward, so log it as a message. One listener in your client entry is the whole integration.

Navigation is the case that heals itself: a failed SPA navigation dispatches `janux:error` and then falls back to a native browser navigation to the same URL. The user still gets the page; you get the report. Nothing to catch.

## Pages that fail

A route that throws during SSR is a server error, not a client one — handle it in your own server wrapper around `server.fetch` and render your error page there ([custom server](/docs/recipes/custom-server)). An unknown path already answers `404`.

Related: [Intents and guards](/docs/guide/intents-and-guards) · [Server API](/docs/reference/server-api) · [Debugging WebMCP](/docs/recipes/debugging-webmcp)

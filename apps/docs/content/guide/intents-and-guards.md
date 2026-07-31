---
title: Intents and guards
description: An intent is a named, schema-typed action on a component.
---

# Intents and guards

An **intent** is a named, schema-typed action on a component. It is the unit of interactivity: a human click and an agent tool call execute the exact same pipeline — guard check, input validation, `run()`, audit.

```tsx
checkout: intent({
  description: 'Pay for the cart. Has monetary side effects.',
  input: schema({ note: str().optional() }),
  guard: 'confirm',
  ready: ({ sources }) => !sources.catalog.pending,
  run: async ({ state, derived, emit, input }) => {
    const order = await pay({ total: derived.total });
    emit('cart.checkedOut', { orderId: order.orderId, total: order.charged });
  },
}),
```

## Guards — human-in-the-loop as a keyword

Every intent (and every `api()`) declares who may invoke it:

| Guard | Human click | Agent call |
|---|---|---|
| `auto` (default) | runs | runs unattended |
| `confirm` | runs | returns a **proposal**; a human approves or rejects |
| `forbidden` | runs | invisible in the manifest; invocation rejected |

Guards can be dynamic, and they see both the request context and **who is asking**: `guard: ({ ctx, origin }) => (ctx.role === 'admin' || origin === 'human' ? 'auto' : 'confirm')`. The most common origin-aware guard — instant for people, approval for agents — is `({ origin }) => (origin === 'agent' ? 'confirm' : 'auto')`; the manifest advertises it as the agent will experience it (`confirm`). `run()` receives the same `origin`, so an intent can also branch its behavior (see [Human vs. agent behavior](/docs/guide/events-and-interactions)).

### Proposals

When an agent hits a `confirm` intent, execution suspends and a proposal is emitted (a `janux:proposal` DOM event on the client; a stored proposal on the server for api tools). Approving executes the original closure exactly once; approvals cannot be replayed.

```ts
const proposal = await window.janux.call('cart.checkout'); // { status: 'proposal', id, ... }
await window.janux.approve(proposal.id);                   // runs it
```

An `api()` proposal created from the page — `window.janux.call('api.…')` — is mirrored client-side: the same `janux:proposal` event fires, and `approve(id)` / `reject(id)` settle it through `/_janux/approve` / `/_janux/reject`. A proposal a *remote* agent parks over HTTP stays server-side only: there is no push channel to open pages yet.

Tip: give your copilot component human-only intents (`guard: 'forbidden'`) for `approve`/`reject`, so an agent can never approve its own proposal.

## Readiness

`ready` declares preconditions as data. A not-ready intent is announced as `ready: false` in the manifest — agents *know* they should wait instead of failing at runtime.

## Binding intents to the view

- Click: `<button onClick={intents.addItem.with({ productId: 'p1' })}>Add</button>` — `.with()` renders the element's `data-input` for you.
- Form: `<form onSubmit={intents.send}><input name="text" /></form>` — form fields become the input object.
- Any other event the same way: `onDoubleClick={intents.open}`, `onWheel={intents.zoom}`, …

All compile to `data-jxa` / `data-jxform` / `data-jxe-*` markers handled by delegated listeners; no per-element handlers exist in the DOM.

## Errors and audit

Invalid input throws with precise paths (`items[0].qty: below min 1`) before `run()` executes. Every invocation — human or agent, allowed or rejected — produces an audit entry: tool, origin, guard, input, ok/error (an `AuditEntry`; `proposed: true` marks a parked `confirm` call that has not run yet).

On the client every entry reaches the page twice, mirroring `janux:proposal`: `boot({ onAudit })` for the app's own code, and a `janux:audit` DOM event for islands that only see the document. An audit-trail island subscribes instead of re-recording actions inside each `run()`:

```ts
import { boot } from 'janux/client';
import type { AuditEntry } from 'janux';

boot({ onAudit: (entry: AuditEntry) => console.log(entry.tool, entry.origin, entry.ok) });
// …or, from any island / plain script:
document.addEventListener('janux:audit', (event) => {
  const entry = (event as CustomEvent<AuditEntry>).detail;
});
```

`bag.origin` is always defined — `'human'` outside intent runs (view, effects, lifecycle), the caller's origin during one — so `run()` can branch on it without a fallback.

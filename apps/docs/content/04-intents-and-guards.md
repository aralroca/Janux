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

Guards can be dynamic: `guard: ({ ctx }) => ctx.role === 'admin' ? 'auto' : 'confirm'`.

### Proposals

When an agent hits a `confirm` intent, execution suspends and a proposal is emitted (a `janux:proposal` DOM event on the client; a stored proposal on the server for api tools). Approving executes the original closure exactly once; approvals cannot be replayed.

```ts
const proposal = await window.janux.call('cart.checkout'); // { status: 'proposal', id, ... }
await window.janux.approve(proposal.id);                   // runs it
```

Tip: give your copilot component human-only intents (`guard: 'forbidden'`) for `approve`/`reject`, so an agent can never approve its own proposal.

## Readiness

`ready` declares preconditions as data. A not-ready intent is announced as `ready: false` in the manifest — agents *know* they should wait instead of failing at runtime.

## Binding intents to the view

- Click: `<button on={intents.addItem} data-input='{"productId":"p1"}'>Add</button>` — the element carries its input as JSON.
- Form: `<form intent={intents.send}><input name="text" /></form>` — form fields become the input object.

Both compile to `data-jxa` / `data-jxform` markers handled by one delegated listener; no per-element handlers exist in the DOM.

## Errors and audit

Invalid input throws with precise paths (`items[0].qty: below min 1`) before `run()` executes. Every invocation — human or agent, allowed or rejected — produces an audit entry: tool, origin, guard, input, ok/error.

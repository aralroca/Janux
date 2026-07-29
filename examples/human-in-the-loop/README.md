# Human in the loop — payments with an approvals inbox

An outgoing-payments desk where **who is asking changes what happens**. The same `send` intent runs
instantly on a human click, but an agent call parks as a `Proposal` that a human settles from an inbox.

- **Three guards, one app** — `draft` is `auto` (agents work unattended), `send` is `confirm` (agents get a proposal), and the inbox's `approve`/`reject` are `forbidden` (an agent can never approve its own proposal).
- **Approvals inbox island** — listens for `janux:proposal` DOM events and lists what agents are waiting on. Approve executes the original closure exactly once; Reject discards it without running.
- **Audit trail with origins** — every executed action is recorded with `origin: human | agent`: the payment sent by click shows up as `human`, the approved agent one as `agent`.
- **Same contract over HTTP** — `api.payments.transfer` carries the `confirm` guard server-side: agent-origin calls return a proposal settled via `POST /_janux/approve` (or `/_janux/reject`), and the `ledger` only ever contains executed transfers.
- **Agent panel** — fire any island tool exactly like an agent would, straight from the page, no model API key needed.

The whole human-in-the-loop mechanism is one keyword on the sensitive intent:

```tsx
import { intent, schema, str } from 'janux';

const send = intent({
  description: 'Send a drafted payment by id. Moves real money.',
  guard: 'confirm',
  input: schema({ id: str() }),
  run: async ({ state, input, origin }) => {
    /* runs instantly for a human click; parked as a Proposal for an agent */
  },
});
```

```bash
bun install
bun run dev   # http://localhost:4321
```

## Where things live

| File | What |
| --- | --- |
| `src/components/PaymentsDesk.tsx` | The queue, the `confirm`-guarded `send` intent and the origin-tagged audit trail |
| `src/components/ApprovalsInbox.tsx` | Parks `janux:proposal` events; human-only `approve` / `reject` |
| `src/components/AgentPanel.tsx` | Calls the same tools with agent origin, straight from the page |
| `src/server/payments.api.ts` | `api.payments.transfer` (`confirm` over HTTP) and the executed-only `ledger` |
| `e2e/human-in-the-loop.e2e.test.ts` | SSR, HTTP proposal lifecycle and browser approve/reject flows |

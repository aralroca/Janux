# Forms interop — `react-hook-form` + `zod`

A signup form mounted **unchanged** through `foreign()` — and the one example in the matrix where the island is *not* the single owner of the truth.

- **Two owners, reconciled explicitly** — react-hook-form keeps its own copy of the form state in uncontrolled inputs; that is exactly why it is fast. An agent calling `signup.fill` writes island state, and RHF would never notice, because its inputs never re-read it. The React file calls `reset(draft)` when the draft identity changes. That seam is visible on purpose rather than hidden.
- **Validation stays entirely in React** — zod messages are rendered by RHF; Janux is not involved and does not duplicate the rules.
- **`submit` is guarded** — a human clicking *Create account* executes it (the click is the approval); an agent calling it gets a proposal. Signing someone up is a propose-don't-do action.
- **Server-rendered** — the whole form is in the HTML.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Why this is ⚠️ and not ✅

Everything works, but the pattern costs you something real: the island's `draft` and RHF's internal form state are two copies of the same data, and keeping them in step is your code, not the framework's. For a form whose values an agent never needs to write, drop the reconciliation and let RHF own everything — `submit` alone is a perfectly good agent surface.

`examples/with-forms` shows the opposite trade: one `schema()` as the contract for the UI, the endpoint and the tool, with no second runtime at all.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `react-hook-form`, `zod`, `@hookform/resolvers`) | **350 kB** | **110 kB** |

React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).

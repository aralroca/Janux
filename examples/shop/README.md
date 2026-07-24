# Shop — cart, copilot & human approval

The flagship example: a small storefront that is simultaneously a UI and an agent surface.

- **Catalog `source`** streams products from the server; the cart is schema-typed island state.
- **Debounced persist `effect`** saves the cart as you edit it.
- **`confirm`-guarded checkout** — agents can fill the cart, but checkout returns a *proposal* that a human approves in the UI.
- **Copilot island** wired to `/_janux/agent`; configure a model via `.env` (`JANUX_MODEL` or a provider API key — see `.env.example`).
- **Dynamic route** `orders/[id]` shows the order after approval.
- **Agent eval** — `evals/checkout.eval.json` drives the whole flow headlessly: `bunx janux eval`.

```bash
bun install
bun run dev   # http://localhost:3000
```

The right panel is the agent surface — the same thing as `curl localhost:3000/_janux/manifest`.

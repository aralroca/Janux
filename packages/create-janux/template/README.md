# __APP_NAME__

A [Janux](https://github.com/aralroca/Janux) app. One component, two faces: this task board is a UI for you **and** a set of typed tools for your copilot.

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
bun test           # the example unit test — no browser needed
```

Enable the copilot (optional): copy `.env.example` to `.env` and set `JANUX_MODEL` or one provider API key.

## What's inside

| File | Shows |
|---|---|
| `src/components/TaskBoard.tsx` | State, derived, intents, a `confirm` guard, a debounced persist effect, events |
| `src/components/ThemeToggle.tsx` | Two islands sharing a store |
| `src/stores.ts` | Shared state as `store://theme` |
| `src/server/tasks.api.ts` | api(): endpoint + client stub + agent tool from one definition |
| `src/components/Copilot.tsx` | The copilot chrome: turn protocol + proposals with human approve |
| `src/components/TaskBoard.test.ts` | Testing intents & guards without a browser |

## See the second face

```bash
curl -s localhost:3000/_janux/manifest | jq        # what agents see
```

Try asking the copilot: *"add a task to buy milk, then show me what's left"* — and watch `tasks.clearDone` come back as a proposal you approve on screen.

Docs: start with the [tutorial](https://github.com/aralroca/Janux/tree/main/apps/docs/content/tutorial) — it builds exactly this app.

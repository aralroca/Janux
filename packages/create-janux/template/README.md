# __APP_NAME__

A [Janux](https://github.com/aralroca/Janux) app. One component, two faces: the counter is a UI for you **and** a set of typed tools for agents — the right panel shows that second face live, exactly like the [playground](https://github.com/aralroca/Janux/tree/main/apps/docs).

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
bun test           # the example unit test — no browser needed
```

## What's inside

| File | Shows |
|---|---|
| `src/components/Counter.tsx` | State, typed intents, and a `confirm` guard |
| `src/components/AgentPanel.tsx` | The agent bridge: manifest, resource reads, calls, proposals with human approve |
| `src/components/Counter.test.ts` | Testing intents & guards without a browser |

Press **Call as agent** on `counter.reset` — the `confirm` guard turns the call into a proposal: nothing runs until you approve it on screen.

## See the second face over HTTP

```bash
curl -s localhost:3000/_janux/manifest | jq        # what agents see
```

Docs: start with the [tutorial](https://github.com/aralroca/Janux/tree/main/apps/docs/content/tutorial). Want a chat copilot in your app? See the [shop example](https://github.com/aralroca/Janux/tree/main/examples/shop).

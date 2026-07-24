# Quick start

## Create an app

```bash
bun create janux my-app
cd my-app
bun install
bun run dev
```

`bunx create-janux my-app` is the same command. Prefer starting from a complete app? Any [example](/docs/more/examples) works as a template:

```bash
bun create janux my-shop --example shop
```

**Requirements:** [Bun](https://bun.sh) ≥ 1.3. No other global tooling.

## What the dev server gives you

```
janux dev ready
  → app:      http://localhost:3000/
  → manifest: http://localhost:3000/_janux/manifest
  → agent:    http://localhost:3000/_janux/agent
```

Open the app: a counter island and an agent panel. Then open the **manifest** — that JSON is your app as an agent sees it, generated from the same components. The two views are never out of sync because there is only one definition.

```bash
curl localhost:3000/_janux/manifest
```

## Make your first change

Edit `src/components/Counter.tsx` and add an intent:

```tsx
intents: {
  inc: intent({
    description: 'Increment the counter',
    input: schema({ by: int().default(1) }),
    run: ({ state, input }) => (state.count += input.by),
  }),
  double: intent({
    description: 'Double the counter',
    run: ({ state }) => (state.count *= 2),
  }),
},
```

Save. Three things happen at once: the view hot-reloads, `counter.double` appears in the manifest, and the copilot can call it — no registration, no schema written twice.

## Turn on the copilot

The agent panel needs a model. Set **one** environment variable:

```bash
# option 1: pick the model explicitly
JANUX_MODEL="anthropic/claude-fable-5" bun run dev

# option 2: just give it a provider key and let it choose
ANTHROPIC_API_KEY=sk-... bun run dev
```

Also supported: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`. Resolution order is `defineAgent({ model })` → `JANUX_MODEL` → provider-key sniffing → a setup card. Without any of them the app still boots and tells you exactly which variable to set.

Now ask the copilot *"double the counter twice"* and watch the view update — the agent called the same intent your button calls.

## Ship it

```bash
bun run build     # bundles client assets
bun run start     # production server on Bun
```

Apps with no islands (or `"output": "static"`) build to a folder of HTML you can host anywhere — see [CLI and deployment](/docs/guide/cli-and-deployment).

Next: [Project structure](/docs/getting-started/project-structure) · [Mental model](/docs/getting-started/mental-model)

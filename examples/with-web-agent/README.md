# Web agent console

A mini product console operated in natural language, with the interaction visualizer on: a status chip per tool call, an animated gradient ring around the element being operated, and a backdrop veil that keeps the user's focus on the action.

- **The agent calls the same intents a human clicks** — `console.goToTab`, `users.search`, `team.invite`, `workflow.addStep` are the tools *and* the click handlers. No parallel agent API.
- **Zero wiring for the feedback** — `createCopilot({ visualize })` is the whole of it. The framework feeds it from `janux:tool-call` for this app's intents (including the `glowTarget` the workflow declares) and from the agent's own steps for the DOM fallback, and stands the built-in `glow` down while it runs.
- **Glow on DOM that doesn't exist yet** — `workflow.addStep` declares `glowTarget`, so the ring waits for the React Flow node to mount instead of missing it.
- **A DOM fallback that is honest** — the display name is only reachable by hand: its intent is `guard: 'forbidden'`, so it never reaches the manifest and the agent has to read the page and fill the field, landing on the very same intent a keystroke does.
- **React, unchanged** — the canvas is `@xyflow/react` mounted with `foreign()` (`hydrate: 'only'`, since React Flow measures the viewport on mount).

```bash
bun install
bun run dev   # http://localhost:3000
```

Ask it: **"invite jane@acme.com as admin"**, **"search Kenji"**, **"change my display name to Neo"** (the DOM fallback), or **"build a workflow"** — the ring follows every node as it appears.

## No API key needed

The brain is a scripted planner (`src/demo-plan.ts`) so the demo is deterministic and runs offline. For a real model, hand `createCopilot` a real one in `src/copilot.ts`:

```ts
import { localLlm, serverLlm, supportsLocalLlm } from '@janux/agent/local';

llm: supportsLocalLlm() ? localLlm() : serverLlm(),
```

`serverLlm()` posts to the built-in `/_janux/llm` mount (resolved from `JANUX_MODEL` or a provider key); `localLlm()` runs an open-source model in the browser. Tools execute in the page either way.

## Where things live

| File | What it shows |
|---|---|
| `src/components/Console.tsx` | The shell: `tab` state, `goToTab`, and every panel kept mounted so switching tabs never throws work away |
| `src/components/Team.tsx` | One intent, two faces: the human's click uses the fields, the agent passes `{ email, role }` |
| `src/components/Profile.tsx` | A `forbidden` intent — the human UI has it, the agent surface doesn't |
| `src/components/Workflow.tsx` | `glowTarget` for asynchronously mounted nodes + the `foreign()` React Flow island |
| `src/copilot.ts` | The copilot: `visualize`, chip labels, and the scripted planner seam |

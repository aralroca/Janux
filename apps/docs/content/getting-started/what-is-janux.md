# What is Janux?

Janux is a fullstack framework for the **[Agentic Web](/docs/getting-started/the-agentic-web)** — the web that both people and AI agents operate. It has **two first-class audiences**: the humans who use your app and the agents that drive it. You write one component definition; Janux projects it three ways — a view for people, a typed resource agents can read, and typed tools both can invoke. They can't drift, because they're generated from the same source.

```tsx title="src/components/Counter.tsx"
export const Counter = component({
  name: 'counter',
  description: 'A counter agents can read and change',
  state: schema({ count: int() }),
  intents: {
    inc: intent({ description: 'Increment', input: schema({ by: int().default(1) }), run: ({ state, input }) => (state.count += input.by) }),
  },
  view: ({ state, intents }) => (
    <button onClick={intents.inc}>{state.count}</button>
  ),
});
```

That definition is simultaneously:

- **A view** — server-rendered HTML that resumes on first interaction.
- **A resource** — `ui://counter`, plain JSON state agents can read.
- **A tool** — `counter.inc` with a JSON Schema input and a guard, callable by a copilot, by a remote MCP client, or by a click.

## Why it exists

Two shifts happened at once. Models now write most UI code, and they need a target with fewer traps than hooks-and-effects. And apps are increasingly expected to be *operable* by agents, which today means bolting a second, hand-written integration onto an app that already has all the logic. Janux collapses both problems into one definition:

| Problem | How Janux answers it |
|---|---|
| Agents generate plausible-but-broken UI code | One declarative shape per component. No hooks, no dependency arrays, no lexical capture in mutations. |
| Humans can't review AI-written diffs fast | State, actions, guards and view sit in a single definition — the PR is the whole truth of the component. |
| Wiring an app to an agent is a project | The manifest, tools and MCP endpoint are generated. Connecting a copilot is a URL. |
| Agent contracts rot | They're derived from the code that renders. Drift is structurally impossible. |
| Agents doing dangerous things | Guards (`auto` / `confirm` / `forbidden`) are declared per intent and enforced per request origin. |

## Agent-ready by default

Every Janux app speaks the protocols of the Agentic Web without a line of integration code: a hosted **MCP** server at `/_janux/mcp` generated from your `api()` functions, **WebMCP** tools registered on `document.modelContext` as islands mount, an opt-in `llms.txt` with a Markdown projection of every page, and **Web Bot Auth** (RFC 9421) agent identity. The layer with no standard yet — *authority* — is a language feature here: `guard: 'confirm'` turns an agent's call into a Proposal a human approves on the real UI.

More on the shift and the stack: [The Agentic Web](/docs/getting-started/the-agentic-web).

## What it is not

- **Not a chatbot bolted onto a UI.** The agent surface is the app's own contract; the copilot is optional.
- **Not React with extra steps.** The component model is different on purpose — see [Mental model](/docs/getting-started/mental-model). You *can* mount real React components unchanged where you need the ecosystem ([interop](/docs/guide/interop)).
- **Not a hydration framework.** Pages resume from JSON snapshots; static pages ship 0 KB of JS.

## What's in the box

Server rendering with islands and resumability, file-system routing with layouts and typed matchers, `api()` server functions that double as agent tools, a client data cache, i18n, a built-in copilot with an embedded agent harness (memory, durable workflows, guardrails, rate limiting), a hosted MCP endpoint, `llms.txt` and Markdown projections of every page, plus a CLI that builds to a Bun server or a fully static site.

Next: [Quick start](/docs/getting-started/quick-start) — an app running in about a minute.

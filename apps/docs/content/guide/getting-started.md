# Getting started

Janux is a fullstack UI framework with **two first-class audiences**: humans and AI agents. A single component definition projects a view (for people), a typed resource (for agents) and a set of tools (for both) — so your UI and your agent surface can never drift apart.

New here? Take the short path first:

| Page | What you get |
|---|---|
| [What is Janux?](/docs/getting-started/what-is-janux) | The idea, and what's in the box |
| [Quick start](/docs/getting-started/quick-start) | An app running, copilot included |
| [Project structure](/docs/getting-started/project-structure) | Every convention, all optional |
| [Mental model](/docs/getting-started/mental-model) | The four ideas that carry the framework (and a React map) |
| [Editor setup](/docs/getting-started/editor-setup) | tsconfig, JSX runtime, troubleshooting |

## In one command

```bash
bun create janux my-app
cd my-app && bun install && bun run dev
```

The dev server prints three URLs: your app, `/_janux/manifest` (what agents see) and `/_janux/agent` (the copilot endpoint). Open the first two side by side — that's the whole pitch.

## Then read this guide in order

The rest of the guide builds an app the way you actually would: [Components](/docs/guide/components) → [Schema types](/docs/guide/schema) → [Intents and guards](/docs/guide/intents-and-guards) → [Stores](/docs/guide/stores) → [api() as agent tools](/docs/guide/api-rpc) → [The agent and your copilot](/docs/guide/agent-and-copilot).

Prefer learning by doing? The [tutorial](/docs/tutorial/tasks-app-part-1) builds a task board with two faces in three parts, and every [example app](/docs/more/examples) runs with one command.

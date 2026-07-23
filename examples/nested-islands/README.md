# Nested islands

Stateful components inside stateful components, three levels deep (`Board → Card → Badge`), plus a controlled input:

- Each island keeps its **own state and render loop** — a card's `+1` never re-renders the board or its siblings.
- Children are **conditional**: remove a card and its island is disposed; add it back and a fresh one mounts client-side.
- Every level is **agent-visible**: `ui://card#board.default.c0` is a resource, and its `inc` is a tool. Try it from the agent panel.
- The title is a **controlled input** (`value={state.title}` + `onInput={intents.rename}`) — IME-safe, no cursor jumps, and the agent can rename the board through the same intent.

```bash
bun install
bun run dev   # http://localhost:3000
```

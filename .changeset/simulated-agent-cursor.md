---
"janux": minor
---

Simulated agent cursor, combinable with the glow.

`boot({ cursor: true })` — or `{ cursor: { duration } }` — paints an overlay arrow that travels the screen element to element as an agent operates the page, starting from the center of the viewport on its first move. It consumes the same `janux:tool-call` / `janux:tool-target` events as the glow, so the two layers combine freely: both, either, or neither. Style it like the glow, via the `--janux-cursor-*` CSS variables on `#janux-agent-cursor`; `suspendAgentGlow()` stands both built-in layers down, so a richer visualizer replaces them together. New from `janux/client`: `enableAgentCursor`, `moveCursorTo`, `injectCursorStyles`, `CURSOR_ID`.

The playground's agent panel gained a second checkbox for the cursor (on by default, like the glow's), and every example that boots `glow: true` now boots `cursor: true` alongside it. Both layers' default ring color moves from violet to blue (`rgba(37, 99, 235, …)`) — override via the CSS variables as before.

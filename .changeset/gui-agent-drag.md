---
'@janux/agent': patch
---

`createCopilot()` runs on `@aralroca/gui-agent` 0.7: with `domFallback: true` the model can `drag` an element onto another (HTML5 drag and drop, so it lands on your `onDragStart` / `onDrop` intents), and `visualize: { cursor: true }` shows a pointer that carries what is dragged to where it is dropped.

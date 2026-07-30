---
'janux': minor
'@janux/vite': minor
---

`worker()` — a new `janux/worker` entry point that runs a function on a Web Worker thread, so expensive work stops
blocking clicks, typing, scrolling and animation. It is marked **experimental** in `STABILITY.md`: the worker is
emitted by a source transform because Vite cannot emit a worker chunk from a plugin, and that strategy is expected
to change under the API.

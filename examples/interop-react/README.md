# React interop

A plain React component (`Mixer.tsx`, hooks and all) mounted **unchanged** inside a Janux app via `foreign()`:

- **Real embedded root** — `react-dom` `createRoot`, full behavioral fidelity, SSR markup when react is installed.
- **Tracked props bridge** — the mixer renders the shell's typed `state.bands`; a state change re-renders only the React root.
- **Events → intents** — dragging a slider calls `onBand`, which lands as the shell's `setBand` intent: typed, audited, and **the same tool the agent uses**. Try `mixer.setBand { name: "low", level: 9 }` from the agent panel.
- **Wrap-once agent legibility** — the foreign island is opaque; the `mixer` shell projects the resource and tools. `mixer.flat` carries a `confirm` guard: agents get a proposal, humans approve.

```bash
bun install
bun run dev   # http://localhost:3000
```

# A11y primitives interop — `@radix-ui/react-dialog`

A destructive confirmation dialog mounted **unchanged** through `foreign()`. This is the example the framework's portal fix exists for.

- **Portals escape the host, and that is fine now** — Radix renders the dialog into `document.body`, outside the `<janux-foreign>` host the navigation morph treats as an opaque leaf. The e2e asserts the escape as a fact, then navigates away with the dialog open and asserts that nothing throws **and** that the scroll lock is released. The second half matters: before the fix React's teardown aborted midway, so `<body>` stayed `overflow: hidden` on the next page — which a `try/catch` around `unmount()` would not have fixed.
- **The whole a11y contract is the library's** — focus trap, escape handling, `aria-haspopup`, `aria-expanded`, the scroll lock. Janux adds none of it and breaks none of it. The trigger's ARIA is server-rendered.
- **The agent opens the same dialog a human does** — `workspace.setOpen` drives Radix's `open` prop, and the focus trap engages exactly as if the trigger had been clicked.
- **Deletion is guarded** — `workspace.remove` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Two routes on purpose

`/settings` exists so the dialog has somewhere to be navigated away *from*. The portal regression is only observable across a client-side navigation, and there is no way to test that with a single route.

Note that a real modal blocks pointer events outside itself — Radix working as intended — so a human cannot click the nav link while the dialog is open. The navigation that *can* happen with a dialog open is a programmatic one: an agent's `ui_navigate`, a history entry, a timeout. That is what the test drives.

## Radix, not Base UI

`@base-ui-components/react` is the obvious alternative and is by the same people. It is `1.0.0-rc.0`; pinning CI to a release candidate buys instability rather than coverage, so the matrix lists it as *not verified* with that reason rather than guessing.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `@radix-ui/react-dialog`) | **297 kB** | **96 kB** |

React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).

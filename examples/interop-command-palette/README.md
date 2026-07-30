# Command palette interop — `cmdk`

A command palette mounted **unchanged** through `foreign()`, where the palette's command list and the agent's tool schema are literally the same list.

- **The palette IS the manifest** — `palette.run` takes `id: 'new-doc' | 'new-folder' | 'toggle-theme' | 'zen-mode' | 'archive'`. Whatever a human can pick, the agent can call; neither can invent a command that doesn't exist. The e2e asserts the enum equals the rendered `data-command` ids, so the two cannot drift.
- **The easy end of the callback spectrum** — cmdk hands each callback exactly one scalar, already the payload. This example is in the matrix precisely because "the boundary needs a mapper" is a claim about *some* libraries, not all of them.
- **Fully server-rendered** — cmdk's whole DOM, its hidden label and its group headings arrive in the HTML.
- **Guarded clear** — `palette.clear` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `cmdk`) | **308 kB** | **100 kB** |

React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).

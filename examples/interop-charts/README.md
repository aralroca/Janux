# Charts interop — `recharts`

A real charting library mounted **unchanged** through `foreign()`, with the series, visibility and selection living in Janux state.

- **The payload is the second argument** — Recharts calls `onClick(data, index, event)`. The short `on: { prop: 'intent' }` form forwards `args[0]`, which here is a blob of chart internals; the index an intent actually wants is unreachable. The mapped form picks it: `input: ({ args }) => ({ index: args[1] })`.
- **Legend clicks are intents** — hiding a series goes through `chart.toggleSeries`, so an agent hides the same series the same way, and the `hidden` list is part of the readable resource.
- **The enum is the contract** — `toggleSeries` takes `key: 'revenue' | 'users'`.
- **Guarded reset** — `chart.reset` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## The honest part: SSR is the box, not the chart

Recharts 3 computes its layout in effects, so `renderToString` produces a correctly **sized wrapper with no SVG inside** — verified against a bare `<LineChart>` outside Janux, so this is the library's behavior and not the interop boundary's. That is not nothing: the box is reserved at its real dimensions, so the chart cannot shift the page when it arrives. But the data is not in the HTML, and an agent reading the raw page will not find it there.

It doesn't need to. The numbers live in the island's `ui://chart` resource, which is server-rendered whether or not the SVG is — which is the whole argument for keeping state in the shell rather than inside the foreign component.

The e2e suite asserts the missing `<svg>` on purpose, so this README can't quietly drift into claiming more than Recharts does.

## Why fixed pixel dimensions

`<ResponsiveContainer width="100%">` has to measure the DOM, which the server doesn't have. With explicit `width`/`height` numbers, Recharts is SSR-safe as far as it goes (see above). Use `ResponsiveContainer` if you need fluid sizing, and expect a client-only chart.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `recharts`) | **619 kB** | **188 kB** |

Recharts is the heaviest library in the matrix by a wide margin — it brings d3 and a Redux store. React interop is opt-in and per-island: pages with no foreign island still ship none of it. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).

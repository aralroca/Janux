# Client API

Everything importable from `janux/client`, plus the browser conventions.

## boot(options)

```ts
import { boot } from 'janux/client';
import { Cart } from './components/Cart';

const client = boot({ defs: [Cart], ctx: {} });
```

Called once in `src/client.ts`. It indexes islands and state snapshots, installs two delegated listeners (click, submit) and exposes the bridge as `window.janux`. **No component code runs** until first interaction or agent call — that's the resume guarantee.

`client.mount('name#key')` mounts an island eagerly (e.g. an editor page where the island IS the page).

## The bridge — `window.janux`

| Method | Purpose |
|---|---|
| `read(uri)` | Typed resource snapshot: `ui://cart`, `store://session` |
| `call(tool, input)` | Guard-checked agent-origin invocation; `confirm` returns `{ status: 'proposal', id }` |
| `approve(id)` / `reject(id)` | Resolve a pending proposal (approve executes exactly once) |
| `settled(scope?)` | Resolves when nothing is in flight — sources, effects, debounces, delegated intents |
| `subscribe(event, fn)` | Typed component/store events |
| `manifest()` | Live manifest of the mounted tree |

## DOM events the runtime emits

| Event | detail | When |
|---|---|---|
| `janux:tool-call` | `{ tool, input, phase: 'start' \| 'ok' \| 'proposal' \| 'error' }` | Around every bridge call — build glows, activity feeds, spinners |
| `janux:proposal` | the proposal | An agent hit a `confirm` guard |
| `janux:error` | message string | A delegated intent failed |

## Markup conventions

```html
<button on={intents.addItem} data-input='{"productId":"p1"}'>Add</button>
<form intent={intents.send}><input name="text" /></form>
```

- `on={intents.x}` → delegated click; the element's `data-input` JSON becomes the input.
- `<form intent={intents.x}>` → delegated submit; form fields become the input object.
- Compiled to `data-jxa` / `data-jxform` markers — no per-element listeners exist.

## clientApi(name)

What `*.api.ts` imports become in the browser: a ~100-byte typed fetch stub posting to `/_janux/api/<name>`. You never call this yourself; the compiler does.

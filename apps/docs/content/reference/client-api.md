# Client API

Everything importable from `janux/client`, plus the browser conventions.

## boot(options)

```ts
import { boot } from 'janux/client';
import { Cart } from './components/Cart';

const client = boot({ defs: [Cart], ctx: {}, glow: true });
```

`glow: true | { duration }` enables the built-in agent-activity highlight (see [Events and interactions](/docs/guide/events-and-interactions)); style it with the `--janux-glow-*` CSS variables. Lower-level: `enableAgentGlow`, `glowElement`, `injectGlowStyles`, `GLOW_CLASS`.

`navigation: false` disables client-side SPA navigation (on by default — see [SPA navigation](/docs/guide/navigation#spa-navigation)).

`webmcp: false` disables WebMCP registration (on by default). `boot()` registers every mounted tool with the browser's `document.modelContext` — polyfilled when the browser doesn't ship WebMCP — and re-syncs on every SPA navigation. See [Debugging agent tools with Chrome's WebMCP panel](/docs/recipes/debugging-webmcp). Lower-level: `installWebMCP(bridge)`, `createModelContextPolyfill()`.

## SPA navigation

| Member / attribute | Purpose |
|---|---|
| `client.navigate(url)` | Programmatic SPA navigation (also what agents use) |
| `<Component persist />` | Keep the island's live instance across navigations |
| `<Component eager />` | Mount on load/navigation without waiting for interaction |
| `<a data-native>` | Opt this link out — force a full-page navigation |
| `boot({ navigation: false })` | Disable SPA navigation entirely |

DOM events: `janux:navigate` fires with `{ phase: 'before' | 'after', from, to }` around each SPA navigation. `janux.navigate()` and link navigations both count toward `settled()`.

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

---
title: Client API
description: Everything importable from janux/client, plus the browser conventions.
---

# Client API

Everything importable from `janux/client`, plus the browser conventions.

## boot(options)

```ts
import { boot } from 'janux/client';
import { Cart } from './components/Cart';

const client = boot({ defs: [Cart], ctx: {}, glow: true });
```

`glow: true | { duration }` enables the built-in agent-activity highlight (see [Events and interactions](/docs/guide/events-and-interactions)); style it with the `--janux-glow-*` CSS variables. Lower-level: `enableAgentGlow`, `glowElement`, `glowTargetFor`, `injectGlowStyles`, `emitToolTarget`, `GLOW_CLASS`.

`suspendAgentGlow()` hands the painting over to a richer feedback layer (the copilot's [visualizer](/docs/recipes/local-model-copilot)): the events keep flowing, the built-in glow stops painting, and the returned function resumes it. `glowTargetFor(tool, input?)` resolves the element that carries an intent's delegation marker — the exact control the agent "pressed", whether it is bound through `on`, `<form intent>` or a rich event like `onInput`. Pass the call's `input` and it picks between controls that share one intent by the `data-input` each declares (a tab bar, a table row), instead of always the first. It falls back to the whole island, and to nothing when the target isn't painted (a ring around a box with no geometry would land in the page corner). `emitToolTarget({ element, action, selector })` announces the live element a DOM-fallback tool is about to operate as a `janux:tool-target` event (`ToolTargetDetail`); the built-in client tools use it and never paint by themselves, so whichever feedback layer is enabled owns what the user sees.

`navigation: false` disables client-side SPA navigation (on by default — see [SPA navigation](/docs/guide/navigation#spa-navigation)).

`webmcp: false` disables WebMCP registration (on by default). `boot()` registers every mounted tool with the browser's `document.modelContext` — polyfilled when the browser doesn't ship WebMCP — and re-syncs on every SPA navigation. See [Debugging agent tools with Chrome's WebMCP panel](/docs/recipes/debugging-webmcp). Lower-level: `installWebMCP(bridge)`, `createModelContextPolyfill()`.

`onAudit: (entry) => …` observes every client-side `AuditEntry` — tool, origin, guard, input, ok/error, `proposed` for parked `confirm` calls. The same entries are dispatched as `janux:audit` DOM events, so an island can subscribe without touching `boot()` (see [Errors and audit](/docs/guide/intents-and-guards#errors-and-audit)).

## SPA navigation

| Member / attribute | Purpose |
|---|---|
| `client.navigate(url)` | Programmatic SPA navigation (also what agents use) |
| `<Component persist />` | Keep the island's live instance across navigations |
| `<Component eager />` | Mount on load/navigation without waiting for interaction |
| `<a data-native>` | Opt this link out — force a full-page navigation |
| `boot({ navigation: false })` | Disable SPA navigation entirely |

DOM events: `janux:navigate` fires with `{ phase: 'before' | 'after', from, to }` around each SPA navigation. `janux.navigate()` and link navigations both count toward `settled()`.

A navigation diffs the whole document, so a node some runtime appended to `<body>` — an agent feedback overlay, a portal root — would be dropped for good: no incoming page lists it, and the module that created it doesn't run again. Mark it with `data-janux-keep` (exported as `KEEP_ATTRIBUTE`) and the navigation puts it back where it was — same parent, same position — wherever in the page it lives. Runtime `<head>` styles are kept unconditionally.

Called once in `src/client.ts`. It indexes islands and state snapshots, installs two delegated listeners (click, submit) and exposes the bridge as `window.janux`. **No component code runs** until first interaction or agent call — that's the resume guarantee.

`client.mount('name#key')` mounts an island eagerly (e.g. an editor page where the island IS the page).

## The bridge — `window.janux`

| Method | Purpose |
|---|---|
| `read(uri)` | Typed resource snapshot: `ui://cart`, `store://session` |
| `call(tool, input)` | Guard-checked agent-origin invocation; `confirm` returns `{ status: 'proposal', id }`. `api.*` server tools dispatch too — POSTed to `/_janux/api/<name>` with `x-janux-origin: agent`, envelope unwrapped |
| `approve(id)` / `reject(id)` | Resolve a pending proposal (approve executes exactly once). Mirrored `api.*` proposals settle through `/_janux/approve` / `/_janux/reject` — a human act, so no agent header |
| `settled(scope?)` | Resolves when nothing is in flight — sources, effects, debounces, delegated intents |
| `subscribe(event, fn)` | Typed component/store events |
| `manifest()` | Live manifest of the mounted tree |

## DOM events the runtime emits

| Event | detail | When |
|---|---|---|
| `janux:tool-call` | `{ tool, input, phase: 'start' \| 'ok' \| 'proposal' \| 'error' }` | Around every bridge call — build glows, activity feeds, spinners |
| `janux:proposal` | the proposal | An agent hit a `confirm` guard (component intents and page-initiated `api.*` calls alike) |
| `janux:audit` | the `AuditEntry` | Every client-side invocation — the same entries `boot({ onAudit })` receives |
| `janux:error` | message string | A delegated intent failed |

## Markup conventions

```html
<button onClick={intents.addItem} data-input='{"productId":"p1"}'>Add</button>
<form onSubmit={intents.send} reset><input name="text" /></form>
```

- `onClick={intents.x}` → delegated click; the element's `data-input` JSON becomes the input (`.with()` writes it for you).
- `<form onSubmit={intents.x}>` → delegated submit; form fields become the input object.
- Any other `on<Event>={intents.x}` → a delegated `data-jxe-<event>` marker; the listener for an event type installs only when a page actually uses it.
- `reset` on that form restores its controls once the intent has the values — the chat-box case. State can't: a controlled write is skipped while the control has focus (no cursor jumps), and submitting with Enter never moves focus. It is the platform's `form.reset()`, so a field goes back to its rendered `value`: leave the field uncontrolled and that is the empty string.
- Compiled to `data-jxa` / `data-jxform` / `data-jxreset` markers — no per-element listeners exist.

## clientApi(name)

What `*.api.ts` imports become in the browser: a ~100-byte typed fetch stub posting to `/_janux/api/<name>`. You never call this yourself; the compiler does.

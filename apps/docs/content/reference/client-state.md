# Client state — persistStore, urlState, dropzone

Three browser-side helpers from `janux/client`: state that survives a reload, state that lives in the URL, and files coming in from the user.

```ts
import { persistStore, urlState, dropzone } from 'janux/client';
```

## Persisted stores

Mirrors a [store](/docs/guide/stores)'s state into storage and restores it on boot. Declare it on the store def — `'local'` for the defaults, or a config object:

```ts
import { store, schema, str } from 'janux';

export const theme = store({
  name: 'theme',
  state: schema({ mode: str().default('light') }),
  intents: {},
  persist: {
    name: 'my-app:theme',
    partialize: (state) => ({ mode: state.mode }),   // don't persist transient fields
    version: 2,
    migrate: (persisted, from) => (from < 2 ? { mode: persisted.dark ? 'dark' : 'light' } : persisted),
  },
});
```

The runtime wires it up when the store first mounts (`persistStore` under the hood — the low-level `persistStore(instance, config)` from `janux/client` is for embedders holding a live `JanuxInstance`).

| `PersistConfig` | Default | Notes |
|---|---|---|
| `name` | `janux:store:<store name>` | Storage key |
| `storage` | `localStorage` | Any `StateStorage`: `getItem` / `setItem` / `removeItem`, sync **or** async — so `sessionStorage`, IndexedDB wrappers and native bridges all fit |
| `partialize` | persist everything | Pick the slice worth keeping. Transient flags (`isLoading`, open dialogs) should stay out |
| `version` | `0` | Bump when the shape changes |
| `migrate` | — | `(persisted, from) => state`. Runs when the stored version is older; without it, incompatible payloads are dropped rather than crashing your boot |

Persisted payloads are versioned envelopes, so a shipped rename can't leave a user stuck with state your code no longer understands.

## urlState(name, type, fallback, options?)

Puts a piece of UI state in the query string: shareable, deep-linkable, back/forward-correct.

```ts
import { urlState } from 'janux/client';
import { str } from 'janux';

const tag = urlState('tag', str(), 'all');

tag.value.value;      // reactive read (a signal)
tag.set('display');   // writes ?tag=display
```

- **Schema-validated.** The raw param is parsed (JSON when it starts with `[` or `{`) and validated against the [schema type](/docs/reference/schema-api). Anything invalid falls back — a hand-edited URL can't corrupt your state.
- **`replace: true` by default.** Filter and tab changes shouldn't fill the history stack. Pass `{ replace: false }` when a change *is* a navigation step the user should be able to go back through.
- **Back/forward aware.** It listens to `popstate` and re-reads the param, so the signal always matches the address bar.
- **Query-only changes are shallow** — same path, different search means no page re-render and no server round-trip; islands react through this handle. See [Data cache & URL state](/docs/guide/data-cache).

## dropzone(options)

Everything needed to accept files, without writing drag-and-drop plumbing.

```ts
import { dropzone } from 'janux/client';

const zone = dropzone({
  accept: ['image/*', 'application/pdf'],
  multiple: true,
  maxSize: 5_000_000,
  onFiles: (files) => upload(files),
});

const detach = zone.attach(hostElement);   // drag & drop, paste, click-to-pick
zone.isOver.value;                          // reactive: style the drop target
zone.open();                                // open the native picker yourself
```

| `DropzoneOptions` | Notes |
|---|---|
| `accept` | MIME list; `image/*` wildcards supported |
| `multiple` | Defaults to `false` |
| `maxSize` | Bytes; oversized files are filtered out |
| `onFiles` | Called with the files that passed the filters — **never called with an empty list** |

`attach(el)` returns a detach function; wire it up in an `attach` lifecycle and call it in `detach`, or let the [ownership scope](/docs/reference/owners) do it. Filtering happens before `onFiles`, so a rejected file never reaches your code. Pair it with an [HTTP handler](/docs/guide/http-handlers) for the upload endpoint.

Related: [Stores](/docs/guide/stores) · [Data cache & URL state](/docs/guide/data-cache) · [HTTP handlers & uploads](/docs/guide/http-handlers)

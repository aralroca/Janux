# Stores — shared state

A store is a bifacial component without a view: schema-typed state, derived values, intents, events — projected to agents as `store://<name>`.

```ts
import { store, intent, schema, str, obj, enums } from 'janux';

export const Session = store({
  name: 'session',
  description: 'Cross-component session state.',
  state: schema({
    user: obj({ id: str(), name: str() }).nullable(),
    locale: enums(['en', 'es']).default('en'),
  }),
  derived: { isLoggedIn: (s) => s.user !== null },
  intents: {
    setLocale: intent({
      input: schema({ locale: enums(['en', 'es']) }),
      run: ({ state, input }) => (state.locale = input.locale),
    }),
    logout: intent({
      guard: 'confirm',
      run: ({ state, emit }) => { state.user = null; emit('auth.loggedOut', {}); },
    }),
  },
  emits: { 'auth.loggedOut': schema({}) },
});
```

## Consuming a store

Components declare the dependency — no provider wrapping, no hook call:

```tsx
export const Header = component({
  name: 'header',
  use: { session: Session },
  view: ({ use }) => <nav>{use.session.derived.isLoggedIn ? '👤' : <a href="/login">Log in</a>}</nav>,
  intents: {
    switchLocale: intent({
      run: ({ use }) => use.session.intents.setLocale({ locale: 'es' }),
    }),
  },
});
```

## The rules (and why they differ from Zustand)

1. **Mutations only through store intents.** There is no `set()` you can call from anywhere: every mutation of shared state is named, schema-validated, guard-checked and auditable — identical for humans and agents. Direct writes outside a `run()` throw.
2. **The manifest lists readers.** Agents see which mounted components read each store (`readers: ["ui://header"]`) — the blast radius of a mutation is visible before making it.
3. **SSR-safe by construction.** On the server every request gets its own store instances (no shared-singleton leaks); state serializes once per page and resumes on the client like any island.
4. **Server-side stores** register via `src/stores.ts` (exported defs) so SSR can render store-dependent views; the client re-creates them from the serialized snapshot in `boot({ defs })`.

Store events, sources and effects work exactly as in components, and `settled()` covers stores too.

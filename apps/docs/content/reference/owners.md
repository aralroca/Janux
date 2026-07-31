---
title: Ownership — createRoot, onCleanup, getOwner, runWithOwner
description: "The disposal tree behind islands, stores and foreign roots: effects created inside a scope are torn down with it, so nothing leaks when a component leaves the page."
---

# Ownership — createRoot, onCleanup, getOwner, runWithOwner

The disposal tree behind islands, stores and foreign roots: effects created inside a scope are torn down with it, so nothing leaks when a component leaves the page.

```ts
import { createRoot, onCleanup, getOwner, runWithOwner } from 'janux';
```

## createRoot(fn)

`createRoot<T>(fn: (dispose: () => void) => T): T` runs `fn` inside a fresh scope and hands it the scope's `dispose`. Every [`watch`](/docs/reference/watch) and [`computed`](/docs/reference/computed) created within registers automatically.

```ts
import { signal, watch, createRoot } from 'janux';

const count = signal(0);
const stop = createRoot((dispose) => {
  watch(() => console.log(count.value));

  return dispose;
});

count.value = 1;   // logs
stop();
count.value = 2;   // silent — the effect went with the scope
```

**Nested roots cascade.** A root created inside another root is disposed by its parent, so one teardown at the top cleans the whole tree.

## onCleanup(fn)

`onCleanup(fn: () => void): void` registers an arbitrary teardown in the **current** scope. Callbacks run in **reverse registration order** (last registered, first cleaned — the usual "unwind" semantics), and `dispose` is idempotent.

```ts
createRoot((dispose) => {
  const socket = openSocket();

  onCleanup(() => socket.close());
  onCleanup(() => log('closing'));   // runs BEFORE socket.close()

  return dispose;
});
```

Called on an already-disposed scope, `fn` runs **immediately** rather than being silently dropped — late registrations can't leak.

## getOwner() / runWithOwner(owner, fn)

`getOwner(): Owner | null` captures the current scope; `runWithOwner<T>(scope: Owner | null, fn: () => T): T` runs work inside it. Together they carry ownership across an `await`, where the ambient scope is already gone:

```ts
const owner = getOwner();

const data = await fetch(url).then((response) => response.json());

runWithOwner(owner, () => {
  watch(() => render(data));   // registered in the original scope, disposed with it
});
```

Pass `null` to run deliberately **outside** any scope (nothing registers, nothing is disposed for you).

## Why it matters for islands

Island teardown is one `dispose()` on the island's root: effects stop, cleanups unwind, foreign React roots unmount, subscriptions drop. That is what makes navigation safe — an island that leaves a page leaves nothing behind. See [Navigation](/docs/guide/navigation) for what survives a swap and what doesn't.

Related: [`signal`](/docs/reference/signal) · [`watch`](/docs/reference/watch) · [Foreign-UI interop](/docs/guide/interop)

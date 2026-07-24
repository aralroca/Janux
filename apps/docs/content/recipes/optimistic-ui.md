# Optimistic UI

Show the result before the server confirms it, and put the old value back if it fails. `mutation()` gives you the three moments that need: `onMutate` writes the optimistic value and returns a snapshot, `onError` restores it, `onSettled` re-syncs with the server.

```tsx
import { component, intent, schema, str } from 'janux';
import { getQueryClient, mutation, useQuery } from 'janux/client';
import { addTodo, listTodos } from '../server/todos.api';

const client = getQueryClient();
const KEY = ['todos'];

export const addTask = mutation({
  mutationFn: (vars: { text: string }) => addTodo(vars),
  onMutate: (vars) => {
    const previous = client.getQueryData<Array<{ text: string; pending?: boolean }>>(KEY) ?? [];

    client.setQueryData(KEY, [...previous, { text: vars.text, pending: true }]);

    return { previous };
  },
  onError: (_error, _vars, ctx) => client.setQueryData(KEY, ctx?.previous ?? []),
  onSettled: () => client.invalidateQueries(KEY),
});

export const Todos = component({
  name: 'todos',
  description: 'Task list that shows a new task before the server confirms it',
  state: schema({ draft: str().default('') }),
  intents: {
    add: intent({
      description: 'Add a task',
      input: schema({ text: str().min(1) }),
      run: ({ input }) => addTask.mutate({ text: input.text }),
    }),
  },
  view: (bag) => {
    const tasks = useQuery(bag, 'todos', () => ({ queryKey: KEY, queryFn: listTodos }));

    return (
      <ul>
        {(tasks.data.value ?? []).map((task) => (
          <li key={task.text} class={task.pending ? 'pending' : ''}>
            {task.text}
          </li>
        ))}
      </ul>
    );
  },
});
```

## The cache entry has to exist first

`setQueryData` writes into an **existing** entry. On a key nothing has read yet it is a silent no-op — no entry, no write, and your optimistic item never appears:

```ts
const client = new QueryClient();

client.setQueryData(['todos'], [{ text: 'buy milk' }]);
client.getQueryData(['todos']); // undefined — nothing created the entry
```

The `useQuery` in the view is what creates it, which is why the mutation and the view must agree on the key (`KEY` above, one constant, not two literals). Outside a view, `client.getQuery({ queryKey, queryFn })` creates the entry without subscribing to it.

## Snapshot in `onMutate`, restore in `onError`

Whatever `onMutate` returns is handed back as the third argument of `onError` and `onSuccess`. Read the previous value there — not inside `onError`, where the optimistic write has already overwritten it:

```ts
onMutate: () => ({ previous: client.getQueryData(KEY) }),
onError: (_error, _vars, ctx) => client.setQueryData(KEY, ctx?.previous ?? []),
```

`ctx` is typed as possibly `undefined` (a mutation without `onMutate` has none), so keep the `?.` and a fallback.

The order is fixed: `onMutate` → `mutationFn` → (`onSuccess` | `onError`) → `onSettled`. `onSettled` runs both ways, which makes it the right place to invalidate.

## Settling: invalidate the prefix

`invalidateQueries(['todos'])` refetches every entry whose key **starts with** that prefix — `['todos']` and `['todos', 'done']` both, `['users']` neither. It refetches matching entries even when nothing is observing them, and failed refetches are swallowed on purpose: settling must never reject and turn a successful mutation into an error.

If the mutation's response already contains the fresh list, skip the round trip and write it instead:

```ts
onSuccess: (tasks) => client.setQueryData(KEY, tasks),
```

## What the user sees while it's in flight

`mutation()` exposes `isPending` as a signal, so a view can disable the submit button without any extra state:

```tsx
<button type="submit" disabled={addTask.isPending.value}>Add</button>
```

The optimistic item carries its own marker (`pending: true` above) so the same list renders both confirmed and in-flight rows. Keep the marker optional in the shape the server returns, so a refetch simply drops it.

## When the mutation rejects

`run` returns the `mutate()` promise, so a rejection rejects the intent — the click's error surfaces as a `janux:error` DOM event and the audit entry records `ok: false`. Rolling back is the recipe's job; reporting is [error handling](/docs/recipes/error-handling)'s.

For state that belongs to the island rather than the server, you don't need the cache at all: write `state` in `run` and restore it in a `catch` — the mutation gate keeps the render consistent either way.

Related: [Data cache & URL state](/docs/guide/data-cache) · [Data cache API](/docs/reference/data-cache-api) · [Error handling](/docs/recipes/error-handling)

# Tutorial 1/3 — A task board with two faces

We'll build the exact app `create-janux` ships: a task board that is simultaneously a UI and an agent surface. Part 1: the component and its intents.

```bash
bunx create-janux tasks && cd tasks && bun install && bun run dev
```

You could follow along from the generated code — or delete `src/components/TaskBoard.tsx` and rebuild it with us.

## State first

Everything the agent should know lives in `state`, schema-typed:

```tsx
import { component, intent, schema, str, bool, enums, list } from 'janux';

export const TaskBoard = component({
  name: 'tasks',
  description: 'A task board. Agents can add, toggle, filter and (with approval) clear done tasks.',

  state: schema({
    tasks: list({ id: str(), title: str(), done: bool() }),
    filter: enums(['all', 'active', 'done']),
  }),

  derived: {
    remaining: (s) => s.tasks.filter((task) => !task.done).length,
  },
  // ...intents and view below
});
```

Two things to notice: the `description` is written *for the model* — it will appear verbatim in the manifest; and `derived.remaining` is computed, cached and visible in the agent's resource too.

## Intents: one pipeline for clicks and tools

```tsx
intents: {
  add: intent({
    description: 'Add a task by title',
    input: schema({ title: str().min(1) }),
    run: ({ state, input }) => state.tasks.push({ id: taskId(), title: input.title, done: false }),
  }),
  toggle: intent({
    description: 'Toggle a task done/undone by id',
    input: schema({ id: str() }),
    run: ({ state, input }) => {
      const task = state.tasks.find((candidate) => candidate.id === input.id);

      if (task) task.done = !task.done;
    },
  }),
  clearDone: intent({
    description: 'Remove every completed task. Destructive — needs approval.',
    guard: 'confirm',
    run: ({ state }) => (state.tasks = state.tasks.filter((task) => !task.done)),
  }),
},
```

`add` validates: an empty title never reaches your code. `clearDone` carries `guard: 'confirm'` — when a copilot calls it, it becomes a **proposal** a human approves on screen. You didn't write any approval flow; the guard is the flow.

## The view

```tsx
view: ({ state, derived, intents }) => (
  <section class="board">
    <header><h2>Tasks</h2><span>{derived.remaining} left</span></header>
    <form intent={intents.add}>
      <input name="title" placeholder="What needs doing?" />
      <button type="submit">Add</button>
    </form>
    <ul>
      {state.tasks.map((task) => (
        <li key={task.id} class={task.done ? 'done' : undefined}>
          <button on={intents.toggle} data-input={JSON.stringify({ id: task.id })}>✓</button>
          <span>{task.title}</span>
        </li>
      ))}
    </ul>
  </section>
),
```

`<form intent={...}>` turns fields into the intent's input; buttons carry their input as `data-input` JSON. There are no event listeners on any element — one delegated listener resumes the island on your first click.

## See the second face

```bash
curl -s localhost:3000/_janux/manifest | jq '.tools[].name'
# "tasks.add" "tasks.toggle" "tasks.clearDone" ...
```

That manifest wasn't written — it's your component, projected. **Next:** [persistence with api() and effects →](/docs/tutorial/tasks-app-part-2)

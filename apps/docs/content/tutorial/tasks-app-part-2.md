---
title: Tutorial 2/3 — Persistence, effects and a shared store
description: Part 1 gave us a working board that forgets everything on reload.
---

# Tutorial 2/3 — Persistence, effects and a shared store

Part 1 gave us a working board that forgets everything on reload. Let's fix that with an api(), a debounced effect, SSR-loaded data and a theme store shared across islands.

## An api() is three things

```ts title="src/server/tasks.api.ts"
import { api } from '@janux/server';
import { schema, str, bool, list } from 'janux';

const TASK_SHAPE = { id: str(), title: str(), done: bool() };
const saved = new Map<string, unknown[]>();

export const loadTasks = api({
  description: 'Load the saved task list',
  run: ({ ctx }) => ({ tasks: saved.get(String(ctx.userId ?? 'anon')) ?? [] }),
});

export const saveTasks = api({
  description: 'Persist the task list',
  input: schema({ tasks: list(TASK_SHAPE) }),
  run: ({ input, ctx }) => {
    saved.set(String(ctx.userId ?? 'anon'), input.tasks);

    return { saved: input.tasks.length };
  },
});
```

One definition each — and you got: a validated `POST /_janux/api/tasks.saveTasks`, a typed client stub for the browser, and `api.tasks.saveTasks` in the copilot's toolbox. (In-memory here; swap the Map for your DB.)

## Persist with a declared effect

```tsx title="src/components/TaskBoard.tsx" {7,8}
import { effect } from 'janux';
import { saveTasks } from '../server/tasks.api';

effects: {
  persist: effect({
    description: 'Saves tasks to the server after changes settle',
    when: (s) => s.tasks,        // the slice that triggers it — no deps array to lie
    debounce: '400ms',
    run: ({ state }) => saveTasks({ tasks: state.tasks }).then(() => {}),
  }),
},
```

Every mutation of `tasks` — click, form, copilot — schedules a save; rapid edits collapse into one request. Because the effect is *declared*, `settled()` knows about it and agents (and your tests) can await true quiescence.

## Load on the server, resume on the client

```tsx title="src/routes/index.tsx" {2}
export default async function Home() {
  const saved = await loadTasks({});           // direct call on the server — no HTTP

  return <TaskBoard initial={{ tasks: saved.tasks, filter: 'all' }} />;
}
```

The page arrives fully rendered with your tasks in the HTML **and** in the snapshot — the island resumes from it without re-fetching anything.

## A store two islands share

```ts title="src/stores.ts"
export const theme = store({
  name: 'theme',
  state: schema({ mode: enums(['dark', 'light']).default('dark') }),
  intents: {
    toggle: intent({
      description: 'Switch between dark and light mode',
      run: ({ state }) => {
        state.mode = state.mode === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') document.documentElement.dataset.theme = state.mode;
      },
    }),
  },
});
```

Consume it with `use: { theme }` from any island. `ThemeToggle` (in the header) flips it; anything reading `use.theme.state.mode` updates — no props, no context providers. Agents see it too: `store://theme`, tool `theme.toggle`.

**Next:** [the copilot, guards in action, and tests →](/docs/tutorial/tasks-app-part-3)

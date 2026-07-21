import { api } from '@janux/server';
import { schema, str, bool, int, list } from 'janux';

const TASK_SHAPE = { id: str(), title: str(), done: bool() };
const saved = new Map<string, unknown[]>();

export const loadTasks = api({
  description: 'Load the saved task list',
  output: schema({ tasks: list(TASK_SHAPE) }),
  run: ({ ctx }) => ({ tasks: (saved.get(String(ctx.userId ?? 'anon')) as any[]) ?? [] }),
});

export const saveTasks = api({
  description: 'Persist the task list',
  input: schema({ tasks: list(TASK_SHAPE) }),
  run: ({ input, ctx }) => {
    saved.set(String(ctx.userId ?? 'anon'), input.tasks);

    return { saved: input.tasks.length };
  },
});

export const taskStats = api({
  description: 'Aggregate stats over the saved tasks',
  output: schema({ total: int(), done: int() }),
  run: ({ ctx }) => {
    const tasks = (saved.get(String(ctx.userId ?? 'anon')) as any[]) ?? [];

    return { total: tasks.length, done: tasks.filter((task) => task.done).length };
  },
});

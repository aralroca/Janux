import { bool, component, createInstance, enums, intent, jsx, list, schema, str } from 'janux';

/**
 * The task board the tutorial builds, assembled exactly as
 * tutorial/tasks-app-part-1.md documents it (its fences are split into
 * state / intents / view). Shared by the tutorial and testing-components tests.
 */
let nextId = 0;
const taskId = () => `t${(nextId += 1)}`;

const TaskBoard = component({
  name: 'tasks',
  description: 'A task board. Agents can add, toggle, filter and (with approval) clear done tasks.',
  state: schema({
    tasks: list({ id: str(), title: str(), done: bool() }),
    filter: enums(['all', 'active', 'done']),
  }),
  derived: {
    remaining: (state: any) => state.tasks.filter((task: any) => !task.done).length,
  },
  intents: {
    add: intent({
      description: 'Add a task by title',
      input: schema({ title: str().min(1) }),
      run: ({ state, input }: any) => state.tasks.push({ id: taskId(), title: input.title, done: false }),
    }),
    toggle: intent({
      description: 'Toggle a task done/undone by id',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        const task = state.tasks.find((candidate: any) => candidate.id === input.id);

        if (task) task.done = !task.done;
      },
    }),
    clearDone: intent({
      description: 'Remove every completed task. Destructive — needs approval.',
      guard: 'confirm',
      run: ({ state }: any) => (state.tasks = state.tasks.filter((task: any) => !task.done)),
    }),
  },
  view: ({ state, derived, intents }: any) =>
    jsx('section', {
      class: 'board',
      children: [
        jsx('span', { children: `${derived.remaining} left` }),
        jsx('form', { intent: intents.add, children: jsx('input', { name: 'title' }) }),
        jsx('ul', {
          children: state.tasks.map((task: any) =>
            jsx('li', {
              key: task.id,
              children: jsx('button', { on: intents.toggle, 'data-input': JSON.stringify({ id: task.id }) }),
            }),
          ),
        }),
      ],
    }),
});

export { TaskBoard };

/** attach() only matters for effects/sources/lifecycle — intents work without it. */
export async function attachedBoard(options: Record<string, unknown> = {}) {
  const instance = createInstance(TaskBoard, options as any);

  await instance.attach();

  return instance;
}

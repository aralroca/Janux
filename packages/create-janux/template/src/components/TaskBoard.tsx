import { component, intent, effect, schema, str, bool, int, enums, list } from 'janux';
import { saveTasks } from '../server/tasks.api';
import { theme } from '../stores';

const FILTERS = ['all', 'active', 'done'] as const;

function taskId(): string {
  return `t_${Math.random().toString(36).slice(2, 9)}`;
}

function visibleTasks(tasks: any[], filter: string): any[] {
  if (filter === 'active') return tasks.filter((task) => !task.done);
  if (filter === 'done') return tasks.filter((task) => task.done);

  return tasks;
}

export const TaskBoard = component({
  name: 'tasks',
  description: 'A task board. Agents can add, toggle, filter and (with approval) clear done tasks.',

  state: schema({
    tasks: list({ id: str(), title: str(), done: bool() }),
    filter: enums([...FILTERS]),
  }),

  derived: {
    remaining: (s: any) => s.tasks.filter((task: any) => !task.done).length,
  },

  effects: {
    persist: effect({
      description: 'Saves tasks to the server after changes settle',
      when: (s: any) => s.tasks,
      debounce: '400ms',
      run: ({ state }: any) => saveTasks({ tasks: state.tasks }).then(() => {}),
    }),
  },

  emits: { 'tasks.cleared': schema({ count: int() }) },

  use: { theme },

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
    remove: intent({
      description: 'Delete a task by id',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        state.tasks = state.tasks.filter((task: any) => task.id !== input.id);
      },
    }),
    setFilter: intent({
      description: 'Show all, active or done tasks',
      input: schema({ filter: enums([...FILTERS]) }),
      run: ({ state, input }: any) => (state.filter = input.filter),
    }),
    clearDone: intent({
      description: 'Remove every completed task. Destructive — needs approval.',
      guard: 'confirm',
      run: ({ state, emit }: any) => {
        const count = state.tasks.filter((task: any) => task.done).length;

        state.tasks = state.tasks.filter((task: any) => !task.done);
        emit('tasks.cleared', { count });
      },
    }),
  },

  view: ({ state, derived, intents }: any) => (
    <section class="board">
      <header>
        <h2>Tasks</h2>
        <span class="count">{derived.remaining} left</span>
      </header>
      <form intent={intents.add}>
        <input name="title" placeholder="What needs doing?" autocomplete="off" />
        <button type="submit">Add</button>
      </form>
      <nav class="filters">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            class={state.filter === filter ? 'on' : undefined}
            on={intents.setFilter}
            data-input={JSON.stringify({ filter })}
          >
            {filter}
          </button>
        ))}
      </nav>
      <ul class="list">
        {visibleTasks(state.tasks, state.filter).map((task: any) => (
          <li key={task.id} class={task.done ? 'done' : undefined}>
            <button class="check" on={intents.toggle} data-input={JSON.stringify({ id: task.id })}>
              {task.done ? '✓' : ''}
            </button>
            <span>{task.title}</span>
            <button class="x" on={intents.remove} data-input={JSON.stringify({ id: task.id })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <footer>
        <button class="clear" on={intents.clearDone}>
          Clear done
        </button>
      </footer>
    </section>
  ),
});

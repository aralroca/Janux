import { bool, component, intent, list, obj, schema, str } from 'janux';

const SEED = [
  { title: 'Ship the release notes', done: false },
  { title: 'Review the onboarding PR', done: true },
  { title: 'Book the offsite room', done: false },
];

const byTitle = (tasks: any[], title: string) =>
  tasks.find((task) => task.title.toLowerCase().includes(title.toLowerCase()));

export const Tasks = component({
  name: 'tasks',
  description: 'The task list the copilot operates — the same intents a human clicks.',
  state: schema({
    tasks: list(obj({ title: str(), done: bool() })).default(SEED),
  }),
  derived: { open: (state: any) => state.tasks.filter((task: any) => !task.done).length },
  intents: {
    add: intent({
      description: 'Add a task to the list.',
      input: schema({ title: str().min(1) }),
      run: ({ state, input }: any) => {
        state.tasks.push({ title: input.title, done: false });

        return { added: input.title };
      },
    }),
    toggle: intent({
      description: 'Mark a task done (or open again) by its title.',
      input: schema({ title: str().min(1) }),
      run: ({ state, input }: any) => {
        const task = byTitle(state.tasks, input.title);

        // Small models hallucinate titles — the real list is the retry hint.
        if (!task) return { error: 'no_such_task', titles: state.tasks.map((entry: any) => entry.title) };
        task.done = !task.done;

        return { title: task.title, done: task.done };
      },
    }),
    clearDone: intent({
      description: 'Remove every completed task.',
      run: ({ state }: any) => {
        const removed = state.tasks.length - state.tasks.filter((task: any) => !task.done).length;

        state.tasks = state.tasks.filter((task: any) => !task.done);

        return { removed };
      },
    }),
  },
  view: ({ state, derived, intents }: any) => (
    <section class="tasks">
      <form id="add-task" onSubmit={intents.add} reset>
        <input name="title" placeholder="Add a task…" autoComplete="off" />
        <button class="primary" type="submit">
          Add
        </button>
      </form>
      <ul id="task-list">
        {state.tasks.map((task: any) => (
          <li key={task.title} data-done={task.done ? 'true' : 'false'}>
            <label>
              <input type="checkbox" checked={task.done} onChange={intents.toggle.with({ title: task.title })} />
              <span>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <footer>
        <span id="open-count">{derived.open} open</span>
        <button id="clear-done" onClick={intents.clearDone}>
          Clear completed
        </button>
      </footer>
    </section>
  ),
});

import { loadTasks } from '../server/tasks.api';
import { TaskBoard } from '../components/TaskBoard';
import { ThemeToggle } from '../components/ThemeToggle';
import { Copilot } from '../components/Copilot';

export const meta = {
  title: 'Tasks — a Janux app',
  description: 'A task board with two faces: a UI for you, typed tools for your copilot.',
};

export default async function Home() {
  const saved: any = await loadTasks({});

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">✦ Tasks</span>
        <ThemeToggle />
      </header>
      <main>
        <TaskBoard initial={{ tasks: saved.tasks, filter: 'all' }} />
        <p class="hint">
          This board is also an agent surface — <code>curl localhost:3000/_janux/manifest</code>
        </p>
      </main>
      <Copilot persist />
    </div>
  );
}

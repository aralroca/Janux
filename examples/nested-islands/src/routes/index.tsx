import { Board } from '../components/Board';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Janux — nested islands',
  description: 'Stateful islands inside stateful islands, three levels deep.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Nested islands</span>
        <span class="bar-hint">Each level keeps its own state · the agent sees every level</span>
      </header>
      <main class="split">
        <section class="preview">
          <Board eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

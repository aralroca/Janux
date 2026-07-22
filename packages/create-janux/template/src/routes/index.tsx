import { Counter } from '../components/Counter';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Welcome to Janux',
  description: 'One component, two faces: a UI for you, typed tools for agents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Janux</span>
        <span class="bar-hint">The counter is your UI · the right panel is what an agent sees</span>
      </header>
      <main class="split">
        <section class="preview">
          <Counter />
          <p class="curl">
            Same surface over HTTP: <code>curl localhost:3000/_janux/manifest</code>
          </p>
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

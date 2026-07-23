import { Catalog } from '../components/Catalog';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Janux — data cache & URL state',
  description: 'A cached, filterable catalog whose filter lives in the URL.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Data cache + URL state</span>
        <span class="bar-hint">Filter is deep-linkable · the agent drives the same intent</span>
      </header>
      <main class="split">
        <section class="preview">
          <Catalog eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

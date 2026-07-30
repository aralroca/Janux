import { AgentPanel } from '../components/AgentPanel';
import { DataGridShell } from '../components/DataGridShell';

export const meta = {
  title: 'Janux — React data grid interop',
  description: 'TanStack Table mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Data grid interop</span>
        <span class="bar-hint">The table is @tanstack/react-table · the state and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <DataGridShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

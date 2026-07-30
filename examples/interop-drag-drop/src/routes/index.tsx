import { AgentPanel } from '../components/AgentPanel';
import { SortableBoardShell } from '../components/SortableBoardShell';

export const meta = {
  title: 'Janux — React drag-and-drop interop',
  description: 'dnd-kit mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Drag & drop interop</span>
        <span class="bar-hint">The dragging is @dnd-kit · the order and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <SortableBoardShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

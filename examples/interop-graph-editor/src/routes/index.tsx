import { AgentPanel } from '../components/AgentPanel';
import { GraphEditorShell } from '../components/GraphEditorShell';

export const meta = {
  title: 'Janux — React graph-editor interop',
  description: 'React Flow mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Graph editor interop</span>
        <span class="bar-hint">The canvas is @xyflow/react · the graph and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <GraphEditorShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

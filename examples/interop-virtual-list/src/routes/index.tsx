import { AgentPanel } from '../components/AgentPanel';
import { VirtualListShell } from '../components/VirtualListShell';

export const meta = {
  title: 'Janux — React virtualization interop',
  description: 'TanStack Virtual mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Virtual list interop</span>
        <span class="bar-hint">The window is @tanstack/react-virtual · the selection and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <VirtualListShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

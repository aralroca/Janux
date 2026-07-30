import { AgentPanel } from '../components/AgentPanel';
import { PaletteShell } from '../components/PaletteShell';

export const meta = {
  title: 'Janux — React command-palette interop',
  description: 'cmdk mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Command palette interop</span>
        <span class="bar-hint">The palette is cmdk · the commands and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <PaletteShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

import { MixerShell } from '../components/MixerShell';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Janux — React interop',
  description: 'A plain React component mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ React interop</span>
        <span class="bar-hint">The sliders are plain React · the state and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <MixerShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}

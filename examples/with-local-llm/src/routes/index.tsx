import { Copilot } from '../components/Copilot';
import { Tasks } from '../components/Tasks';

export const meta = {
  title: 'Janux — local LLM copilot',
  description:
    'A task list operated by a copilot whose model runs in the browser over WebGPU — with the server brain as fallback, swappable at runtime.',
};

export default function Home() {
  return (
    <div class="app">
      <main>
        <h1>Focus</h1>
        <p class="sub">A tiny task list — and a copilot whose brain can live entirely in your browser.</p>
        <Tasks eager />
      </main>
      <Copilot eager />
    </div>
  );
}

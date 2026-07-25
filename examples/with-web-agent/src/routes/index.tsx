import { Console } from '../components/Console';
import { Copilot } from '../components/Copilot';

export const meta = {
  title: 'Janux — web agent console',
  description:
    'A mini product console driven in natural language: the agent calls the same intents a human clicks, and the visualizer shows every step.',
};

export default function Home() {
  return (
    <div class="app">
      <main>
        <h1>Acme Console</h1>
        <p class="sub">A mini stand-in for a real product console — driven by its own agent.</p>
        <Console eager />
      </main>
      <Copilot eager />
    </div>
  );
}

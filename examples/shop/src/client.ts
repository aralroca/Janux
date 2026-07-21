import { boot } from 'janux/client';
import { Cart } from './components/Cart';
import { Copilot } from './components/Copilot';
import { Toasts } from './components/Toasts';

const client = boot({ defs: [Cart, Copilot, Toasts] });

// Toasts must listen from the start — its whole job is reacting to events.
if (document.querySelector('janux-island[data-jx="toasts#default"]')) {
  client.mount('toasts#default').catch((error) => console.error(error));
}

// Glow the island the agent is touching (driven by the bridge's tool events).
document.addEventListener('janux:tool-call', (event: any) => {
  const { tool, phase } = event.detail;
  const island = document.querySelector(`janux-island[data-jx^="${tool.split('.')[0]}#"]`);

  if (!island || tool.startsWith('copilot.')) return;
  if (phase === 'start') island.classList.add('agent-glow');
  else setTimeout(() => island.classList.remove('agent-glow'), 700);
});

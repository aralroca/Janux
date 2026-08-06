import { boot, agentGlow, agentCursor } from 'janux/client';
import { PrimeLab } from './components/PrimeLab';

/**
 * The evidence, not decoration: a plain interval can only keep counting while
 * the main thread is free. It lives outside the island so that no re-render can
 * be what moves it.
 */
function startTicker(): void {
  const node = document.getElementById('ticker');
  let ticks = 0;

  if (!node) return;
  setInterval(() => {
    ticks += 1;
    node.textContent = String(ticks);
  }, 100);
}

boot({ defs: [PrimeLab], glow: agentGlow(), cursor: agentCursor() });
startTicker();

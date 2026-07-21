import { boot } from 'janux/client';
import { Cart } from './components/Cart';
import { Copilot } from './components/Copilot';
import { Toasts } from './components/Toasts';

const client = boot({ defs: [Cart, Copilot, Toasts], glow: true });

// Toasts must listen from the start — its whole job is reacting to events.
if (document.querySelector('janux-island[data-jx="toasts#default"]')) {
  client.mount('toasts#default').catch((error) => console.error(error));
}

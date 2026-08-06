import { boot, agentGlow, agentCursor } from 'janux/client';
import { Cart } from './components/Cart';
import { Copilot } from './components/Copilot';
import { Toasts } from './components/Toasts';

boot({ defs: [Cart, Copilot, Toasts], glow: agentGlow(), cursor: agentCursor() });

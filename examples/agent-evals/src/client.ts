import { boot, agentGlow, agentCursor } from 'janux/client';
import { Stockroom } from './components/Stockroom';

boot({ defs: [Stockroom], glow: agentGlow(), cursor: agentCursor() });

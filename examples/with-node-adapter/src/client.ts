import { boot, agentGlow, agentCursor } from 'janux/client';
import { RuntimeCard } from './components/RuntimeCard';

boot({ defs: [RuntimeCard], glow: agentGlow(), cursor: agentCursor() });

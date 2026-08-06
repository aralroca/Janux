import { boot, agentGlow, agentCursor } from 'janux/client';
import { Registration } from './components/Registration';

boot({ defs: [Registration], glow: agentGlow(), cursor: agentCursor() });

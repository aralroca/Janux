import { boot, agentGlow, agentCursor } from 'janux/client';
import { Notes } from './components/Notes';

boot({ defs: [Notes], glow: agentGlow(), cursor: agentCursor() });

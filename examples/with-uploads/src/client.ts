import { boot, agentGlow, agentCursor } from 'janux/client';
import { Gallery } from './components/Gallery';

boot({ defs: [Gallery], glow: agentGlow(), cursor: agentCursor() });

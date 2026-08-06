import { boot, agentGlow, agentCursor } from 'janux/client';
import { Palette } from './components/Palette';

boot({ defs: [Palette], glow: agentGlow(), cursor: agentCursor() });

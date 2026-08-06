import { boot, agentGlow, agentCursor } from 'janux/client';
import { ThemeLab } from './components/ThemeLab';

boot({ defs: [ThemeLab], glow: agentGlow(), cursor: agentCursor() });

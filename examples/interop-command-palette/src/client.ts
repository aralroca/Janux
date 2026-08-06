import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { PaletteShell } from './components/PaletteShell';

boot({ defs: [AgentPanel, PaletteShell], glow: agentGlow(), cursor: agentCursor() });

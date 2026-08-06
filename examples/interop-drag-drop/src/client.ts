import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { SortableBoardShell } from './components/SortableBoardShell';

boot({ defs: [AgentPanel, SortableBoardShell], glow: agentGlow(), cursor: agentCursor() });

import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { VirtualListShell } from './components/VirtualListShell';

boot({ defs: [AgentPanel, VirtualListShell], glow: agentGlow(), cursor: agentCursor() });

import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { DataGridShell } from './components/DataGridShell';

boot({ defs: [AgentPanel, DataGridShell], glow: agentGlow(), cursor: agentCursor() });

import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { ConfirmDialogShell } from './components/ConfirmDialogShell';

boot({ defs: [AgentPanel, ConfirmDialogShell], glow: agentGlow(), cursor: agentCursor() });

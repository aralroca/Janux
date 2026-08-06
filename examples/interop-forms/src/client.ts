import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { SignupFormShell } from './components/SignupFormShell';

boot({ defs: [AgentPanel, SignupFormShell], glow: agentGlow(), cursor: agentCursor() });

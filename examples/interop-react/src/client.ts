import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { MixerShell } from './components/MixerShell';

boot({ defs: [AgentPanel, MixerShell], glow: agentGlow(), cursor: agentCursor() });

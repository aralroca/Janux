import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { Catalog } from './components/Catalog';

boot({ defs: [AgentPanel, Catalog], glow: agentGlow(), cursor: agentCursor() });

import { boot, agentGlow, agentCursor } from 'janux/client';
import { IncidentBoard } from './components/IncidentBoard';

boot({ defs: [IncidentBoard], glow: agentGlow(), cursor: agentCursor() });

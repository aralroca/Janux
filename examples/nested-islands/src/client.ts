import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { Badge, Board, Card } from './components/Board';

boot({ defs: [AgentPanel, Board, Card, Badge], glow: agentGlow(), cursor: agentCursor() });

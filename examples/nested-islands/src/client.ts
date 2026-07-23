import { boot } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { Badge, Board, Card } from './components/Board';

boot({ defs: [AgentPanel, Board, Card, Badge], glow: true });

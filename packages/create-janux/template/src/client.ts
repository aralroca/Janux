import { boot } from 'janux/client';
import { Counter } from './components/Counter';
import { AgentPanel } from './components/AgentPanel';

boot({ defs: [Counter, AgentPanel], glow: true, cursor: true });

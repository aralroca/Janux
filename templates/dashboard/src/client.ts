import { boot, agentGlow } from 'janux/client';
import { StatusBoard } from './components/StatusBoard';
import { Copilot } from './components/Copilot';

boot({ defs: [StatusBoard, Copilot], glow: agentGlow() });

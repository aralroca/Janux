import { boot, agentGlow, agentCursor } from 'janux/client';
import { ReturnsDesk } from './components/ReturnsDesk';

boot({ defs: [ReturnsDesk], glow: agentGlow(), cursor: agentCursor() });

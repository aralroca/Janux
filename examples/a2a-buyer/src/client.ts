import { boot, agentGlow, agentCursor } from 'janux/client';
import { OrderDesk } from './components/OrderDesk';

boot({ defs: [OrderDesk], glow: agentGlow(), cursor: agentCursor() });

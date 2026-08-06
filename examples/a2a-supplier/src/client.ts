import { boot, agentGlow, agentCursor } from 'janux/client';
import { ApprovalDesk } from './components/ApprovalDesk';

boot({ defs: [ApprovalDesk], glow: agentGlow(), cursor: agentCursor() });

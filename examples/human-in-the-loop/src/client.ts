import { boot, agentGlow, agentCursor } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { ApprovalsInbox } from './components/ApprovalsInbox';
import { PaymentsDesk } from './components/PaymentsDesk';

boot({ defs: [AgentPanel, ApprovalsInbox, PaymentsDesk], glow: agentGlow(), cursor: agentCursor() });

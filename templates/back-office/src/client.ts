import { boot, agentGlow } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { ApprovalsInbox } from './components/ApprovalsInbox';
import { CustomersDesk } from './components/CustomersDesk';

boot({ defs: [AgentPanel, ApprovalsInbox, CustomersDesk], glow: agentGlow() });

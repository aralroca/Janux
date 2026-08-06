import { boot, agentGlow, agentCursor } from 'janux/client';
import { PricingTable } from './components/Pricing';

boot({ defs: [PricingTable], glow: agentGlow(), cursor: agentCursor() });

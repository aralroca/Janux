import { boot, agentGlow, agentCursor } from 'janux/client';
import { RemoteTools } from './components/RemoteTools';

boot({ defs: [RemoteTools], glow: agentGlow(), cursor: agentCursor() });

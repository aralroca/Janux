import { boot, agentGlow, agentCursor } from 'janux/client';
import { ChatRoom } from './components/ChatRoom';

boot({ defs: [ChatRoom], glow: agentGlow(), cursor: agentCursor() });

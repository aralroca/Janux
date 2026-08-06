import { boot, agentGlow, agentCursor } from 'janux/client';
import { Favorites } from './components/Favorites';

boot({ defs: [Favorites], glow: agentGlow(), cursor: agentCursor() });

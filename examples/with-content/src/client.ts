import { boot, agentGlow, agentCursor } from 'janux/client';
import { Poll } from './components/Poll';
import { Trend } from './components/Trend';

// Only the notes that embed one of these ship the runtime; a page of prose has
// no island, so the shell links no script at all.
boot({ defs: [Poll, Trend], glow: agentGlow(), cursor: agentCursor() });

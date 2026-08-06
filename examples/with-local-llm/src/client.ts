import { boot, agentGlow, agentCursor } from 'janux/client';
import { Copilot } from './components/Copilot';
import { Tasks } from './components/Tasks';

// `glow: agentGlow()` is the built-in highlight; the copilot's visualizer takes over
// while a run is active, so both can be on without painting anything twice.
boot({ defs: [Tasks, Copilot], glow: agentGlow(), cursor: agentCursor() });

import { boot } from 'janux/client';
import { Copilot } from './components/Copilot';
import { Tasks } from './components/Tasks';

// `glow: true` is the built-in highlight; the copilot's visualizer takes over
// while a run is active, so both can be on without painting anything twice.
boot({ defs: [Tasks, Copilot], glow: true, cursor: true });

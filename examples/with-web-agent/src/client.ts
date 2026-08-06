import { boot, agentGlow, agentCursor } from 'janux/client';
import { Console } from './components/Console';
import { Copilot } from './components/Copilot';
import { Profile } from './components/Profile';
import { Team } from './components/Team';
import { Users } from './components/Users';
import { Workflow } from './components/Workflow';

// `glow: agentGlow()` is the built-in highlight; the copilot's visualizer takes over
// while it is running, so both can be on without painting the same element twice.
boot({ defs: [Console, Users, Team, Profile, Workflow, Copilot], glow: agentGlow(), cursor: agentCursor() });

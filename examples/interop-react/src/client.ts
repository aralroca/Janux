import { boot } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { MixerShell } from './components/MixerShell';

boot({ defs: [AgentPanel, MixerShell], glow: true });

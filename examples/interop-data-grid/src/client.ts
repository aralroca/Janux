import { boot } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { DataGridShell } from './components/DataGridShell';

boot({ defs: [AgentPanel, DataGridShell], glow: true, cursor: true });

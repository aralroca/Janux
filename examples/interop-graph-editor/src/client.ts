import { boot } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { GraphEditorShell } from './components/GraphEditorShell';

boot({ defs: [AgentPanel, GraphEditorShell], glow: true });

import { boot } from 'janux/client';
import { AgentPanel } from './components/AgentPanel';
import { RevenueChartShell } from './components/RevenueChartShell';

boot({ defs: [AgentPanel, RevenueChartShell], glow: true, cursor: true });

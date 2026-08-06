import { boot, agentGlow } from 'janux/client';
import { SiteSearch } from './components/SiteSearch';

boot({ defs: [SiteSearch], glow: agentGlow() });

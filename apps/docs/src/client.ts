import { boot } from 'janux/client';
import { DocsCopilot } from './components/DocsCopilot';
import { PlaygroundShell } from './components/PlaygroundShell';

boot({ defs: [DocsCopilot, PlaygroundShell] });

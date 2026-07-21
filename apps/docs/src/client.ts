import { boot } from 'janux/client';
import { DocsCopilot } from './components/DocsCopilot';
import { PlaygroundShell } from './components/PlaygroundShell';

const client = boot({ defs: [DocsCopilot, PlaygroundShell] });

// The playground island mounts eagerly: its attach() loads Monaco, and there
// is no user interaction to resume from — the editor IS the page.
if (document.querySelector('janux-island[data-jx="playground#default"]')) {
  client.mount('playground#default').catch((error) => console.error(error));
}

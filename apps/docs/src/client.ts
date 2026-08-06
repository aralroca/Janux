import { boot, agentGlow } from 'janux/client';
import { DocsCopilot } from './components/DocsCopilot';
import { PlaygroundShell } from './components/PlaygroundShell';
import { SearchModal } from './components/SearchModal';
import { ThemeToggle } from './components/ThemeToggle';
import { setupCopyCode } from './copy-code';
import { setupHeroVideo } from './hero-video';
import { setupScoresVideo } from './scores-video';
import { setupTocSpy } from './toc-spy';

const client = boot({ defs: [DocsCopilot, PlaygroundShell, SearchModal, ThemeToggle], glow: agentGlow() });

setupTocSpy();
setupCopyCode();
setupHeroVideo();
setupScoresVideo();

document.addEventListener('keydown', function closeCopilotOnEscape(event) {
  if (event.key !== 'Escape') return;
  if (document.querySelector('dialog[open]')) return; // the ⌘K modal owns this Esc
  if (!document.querySelector('.copilot.open')) return;
  client.call('copilot.toggle').catch(console.error);
});

import { boot } from 'janux/client';
import { DocsCopilot } from './components/DocsCopilot';
import { PlaygroundShell } from './components/PlaygroundShell';
import { SearchModal } from './components/SearchModal';
import { ThemeToggle } from './components/ThemeToggle';
import { setupCopyCode } from './copy-code';
import { setupTocSpy } from './toc-spy';

const client = boot({ defs: [DocsCopilot, PlaygroundShell, SearchModal, ThemeToggle], glow: true });

setupTocSpy();
setupCopyCode();

document.addEventListener('keydown', function closeCopilotOnEscape(event) {
  if (event.key !== 'Escape') return;
  if (document.querySelector('dialog[open]')) return; // the ⌘K modal owns this Esc
  if (!document.querySelector('.copilot.open')) return;
  client.call('copilot.toggle').catch(console.error);
});

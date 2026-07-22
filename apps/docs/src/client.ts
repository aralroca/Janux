import { boot } from 'janux/client';
import { DocsCopilot } from './components/DocsCopilot';
import { PlaygroundShell } from './components/PlaygroundShell';
import { SearchModal } from './components/SearchModal';
import { ThemeToggle } from './components/ThemeToggle';
import { setupTocSpy } from './toc-spy';

boot({ defs: [DocsCopilot, PlaygroundShell, SearchModal, ThemeToggle] });
setupTocSpy();

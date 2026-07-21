import { boot } from 'janux/client';
import { TaskBoard } from './components/TaskBoard';
import { ThemeToggle } from './components/ThemeToggle';
import { Copilot } from './components/Copilot';
import { theme } from './stores';

boot({ defs: [TaskBoard, ThemeToggle, Copilot, theme] });

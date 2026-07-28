import { boot } from 'janux/client';
import { Counter, SlowNews, SlowStats } from './components/Dashboard';
import { BubbleShell, FailingCard } from './components/Broken';

// BrokenLeaf is not booted: its subtree is discarded by BubbleShell's error
// view during SSR, so it never reaches the DOM.
boot({ defs: [Counter, SlowNews, SlowStats, BubbleShell, FailingCard], glow: true });

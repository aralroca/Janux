import { boot, agentGlow, agentCursor } from 'janux/client';
import { LiveScore } from './components/LiveScore';
import { SearchBox } from './components/SearchBox';
import { StoryList } from './components/StoryList';

boot({ defs: [LiveScore, SearchBox, StoryList], glow: agentGlow(), cursor: agentCursor() });

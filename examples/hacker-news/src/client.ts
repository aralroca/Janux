import { boot } from 'janux/client';
import { LiveScore } from './components/LiveScore';
import { SearchBox } from './components/SearchBox';
import { StoryList } from './components/StoryList';

boot({ defs: [LiveScore, SearchBox, StoryList], glow: true, cursor: true });

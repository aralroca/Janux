import { boot } from 'janux/client';
import { Bench } from './components/Bench';
import { Footer } from './components/Footer';
import { Scoreboard } from './components/Scoreboard';
import { score } from './stores';

boot({ defs: [score, Bench, Scoreboard, Footer] });

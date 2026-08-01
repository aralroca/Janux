import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { STREAM_RENDER_CASES } from './stream-render.cases';

// Deliberately NO `useDom()`: this is the server half of streaming suspense,
// and a registered `document` would flip Janux's environment branches.
describe('streaming render: suspense wire format', () => runScenarios(STREAM_RENDER_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BOUNDARY_CASES } from './boundaries.cases';

// No `useDom()`: this is the server half of suspense, and a registered
// `document` would flip Janux's environment branches.
describe('suspense boundaries: registration, nesting and identity', () => runScenarios(BOUNDARY_CASES));

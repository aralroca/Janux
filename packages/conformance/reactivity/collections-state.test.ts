import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { COLLECTIONS_STATE_CASES } from './collections-state.cases';

describe('collections-state conformance', () => runScenarios(COLLECTIONS_STATE_CASES));

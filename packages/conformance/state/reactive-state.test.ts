import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { REACTIVE_STATE_CASES } from './reactive-state.cases';

describe('reactive state conformance', () => runScenarios(REACTIVE_STATE_CASES));

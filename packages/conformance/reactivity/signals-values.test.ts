import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SIGNAL_VALUE_CASES } from './signals-values.cases';

describe('signal value semantics conformance', () => runScenarios(SIGNAL_VALUE_CASES));

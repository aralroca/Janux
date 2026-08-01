import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { COMPUTED_CONSISTENCY_CASES } from './computed-consistency.cases';

describe('computed-consistency conformance', () => runScenarios(COMPUTED_CONSISTENCY_CASES));

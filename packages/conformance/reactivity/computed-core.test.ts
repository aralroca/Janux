import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { COMPUTED_CORE_CASES } from './computed-core.cases';

describe('computed core conformance', () => runScenarios(COMPUTED_CORE_CASES));

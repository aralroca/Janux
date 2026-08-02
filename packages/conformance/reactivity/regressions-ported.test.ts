import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PORTED_REGRESSION_CASES } from './regressions-ported.cases';

describe('regressions-ported conformance', () => runScenarios(PORTED_REGRESSION_CASES));

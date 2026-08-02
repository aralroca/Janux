import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { EFFECT_NESTING_CASES } from './effects-nesting.cases';

describe('effects-nesting conformance', () => runScenarios(EFFECT_NESTING_CASES));

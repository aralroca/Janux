import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { GUARD_CASES } from './guards.cases';

describe('guard pipeline', () => runScenarios(GUARD_CASES));

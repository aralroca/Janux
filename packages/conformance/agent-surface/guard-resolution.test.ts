import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { GUARD_RESOLUTION_CASES } from './guard-resolution.cases';

describe('guard resolution', () => runScenarios(GUARD_RESOLUTION_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { INVALIDATION_CASES } from './invalidation.cases';

describe('invalidation scope', () => runScenarios(INVALIDATION_CASES));

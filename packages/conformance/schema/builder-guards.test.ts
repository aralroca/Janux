import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BUILDER_GUARD_CASES } from './builder-guards.cases';

describe('schema builder guarantees', () => runScenarios(BUILDER_GUARD_CASES));

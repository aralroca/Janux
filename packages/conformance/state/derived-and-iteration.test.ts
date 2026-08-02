import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { DERIVED_AND_ITERATION_CASES } from './derived-and-iteration.cases';

describe('derived state and iteration', () => runScenarios(DERIVED_AND_ITERATION_CASES));

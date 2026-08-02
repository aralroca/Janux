import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { COMPUTED_EQUALITY_CASES } from './computed-equality.cases';

describe('computed-equality conformance', () => runScenarios(COMPUTED_EQUALITY_CASES));

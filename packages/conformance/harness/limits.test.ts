import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { LIMIT_CASES } from './limits.cases';

describe('rate limiting and memory', () => runScenarios(LIMIT_CASES));

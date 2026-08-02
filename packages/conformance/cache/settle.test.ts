import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SETTLE_CASES } from './settle.cases';

describe('settle', () => runScenarios(SETTLE_CASES));

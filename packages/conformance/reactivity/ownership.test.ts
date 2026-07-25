import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { OWNERSHIP_CASES } from './ownership.cases';

describe('ownership and disposal', () => runScenarios(OWNERSHIP_CASES));

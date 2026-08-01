import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { REENTRANCY_CASES } from './reentrancy.cases';

describe('reentrancy conformance', () => runScenarios(REENTRANCY_CASES));

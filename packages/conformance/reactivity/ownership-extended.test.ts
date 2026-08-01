import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { OWNERSHIP_EXTENDED_CASES } from './ownership-extended.cases';

describe('ownership extended conformance', () => runScenarios(OWNERSHIP_EXTENDED_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MIXED_INTEGRATION_CASES } from './mixed-integration.cases';

describe('mixed-integration conformance', () => runScenarios(MIXED_INTEGRATION_CASES));

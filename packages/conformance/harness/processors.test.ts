import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PROCESSOR_CASES } from './processors.cases';

describe('guardrail processors', () => runScenarios(PROCESSOR_CASES));

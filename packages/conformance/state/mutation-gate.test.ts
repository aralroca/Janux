import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { GATE_CASES } from './mutation-gate.cases';

describe('mutation gate conformance', () => runScenarios(GATE_CASES));

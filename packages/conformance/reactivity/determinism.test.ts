import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { DETERMINISM_CASES } from './determinism.cases';

describe('determinism conformance', () => runScenarios(DETERMINISM_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { STRUCTURE_SCALE_CASES } from './structure-scale.cases';

describe('structure-scale conformance', () => runScenarios(STRUCTURE_SCALE_CASES));

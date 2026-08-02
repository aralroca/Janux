import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SEQUENCE_COUNT_CASES } from './sequences-counts.cases';

describe('sequences-counts conformance', () => runScenarios(SEQUENCE_COUNT_CASES));

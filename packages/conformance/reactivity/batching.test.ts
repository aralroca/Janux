import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BATCHING_CASES } from './batching.cases';

describe('batching conformance', () => runScenarios(BATCHING_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CONDITIONAL_GRAPH_CASES } from './conditional-graphs.cases';

describe('conditional-graphs conformance', () => runScenarios(CONDITIONAL_GRAPH_CASES));

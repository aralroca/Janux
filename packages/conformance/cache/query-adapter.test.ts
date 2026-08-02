import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { QUERY_ADAPTER_CASES } from './query-adapter.cases';

describe('query signal adapter', () => runScenarios(QUERY_ADAPTER_CASES));

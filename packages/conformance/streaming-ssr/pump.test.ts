import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PUMP_CASES } from './pump.cases';

// No `useDom()`: the coalescing pump and the abandonment path are the server's.
describe('the chunk pump and the abandonment path', () => runScenarios(PUMP_CASES));

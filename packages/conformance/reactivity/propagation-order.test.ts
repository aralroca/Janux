import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PROPAGATION_ORDER_CASES } from './propagation-order.cases';

describe('propagation-order conformance', () => runScenarios(PROPAGATION_ORDER_CASES));

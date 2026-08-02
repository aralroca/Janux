import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { TEARDOWN_ORDER_CASES } from './teardown-order.cases';

describe('teardown-order conformance', () => runScenarios(TEARDOWN_ORDER_CASES));

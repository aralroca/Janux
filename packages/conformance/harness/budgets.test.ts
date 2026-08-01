import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BUDGET_CASES } from './budgets.cases';

describe('turn budgets', () => runScenarios(BUDGET_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BUDGET_CASES } from './budgets.cases';

describe('budgets that must actually bound', () => runScenarios(BUDGET_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { WORKFLOW_CASES } from './workflows.cases';

describe('durable workflows', () => runScenarios(WORKFLOW_CASES));

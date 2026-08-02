import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { READERS_ACCOUNTING_CASES } from './readers-accounting.cases';

describe('readers-accounting conformance', () => runScenarios(READERS_ACCOUNTING_CASES));

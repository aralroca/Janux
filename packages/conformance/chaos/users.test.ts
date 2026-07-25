import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CHAOS_CASES } from './users.cases';

describe('what users actually do', () => runScenarios(CHAOS_CASES));

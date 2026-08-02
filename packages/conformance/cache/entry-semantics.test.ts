import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { ENTRY_SEMANTICS_CASES } from './entry-semantics.cases';

describe('cache entry semantics', () => runScenarios(ENTRY_SEMANTICS_CASES));

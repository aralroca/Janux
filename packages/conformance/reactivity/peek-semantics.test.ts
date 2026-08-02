import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PEEK_SEMANTICS_CASES } from './peek-semantics.cases';

describe('peek-semantics conformance', () => runScenarios(PEEK_SEMANTICS_CASES));

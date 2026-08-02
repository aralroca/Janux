import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { UNTRACK_EXTENDED_CASES } from './untrack-extended.cases';

describe('untrack extended conformance', () => runScenarios(UNTRACK_EXTENDED_CASES));

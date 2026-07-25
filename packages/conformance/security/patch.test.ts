import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PATCH_CASES } from './patch.cases';

describe('state patch on rehydration', () => runScenarios(PATCH_CASES));

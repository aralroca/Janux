import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MUTATION_HOOK_CASES } from './mutation-hooks.cases';

describe('mutation hooks', () => runScenarios(MUTATION_HOOK_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BUILDER_CASES } from './builders.cases';

describe('schema builders', () => runScenarios(BUILDER_CASES));

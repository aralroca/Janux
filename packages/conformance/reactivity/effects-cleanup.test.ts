import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { EFFECT_CLEANUP_CASES } from './effects-cleanup.cases';

describe('effect cleanup conformance', () => runScenarios(EFFECT_CLEANUP_CASES));

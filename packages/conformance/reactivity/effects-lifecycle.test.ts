import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { EFFECT_LIFECYCLE_CASES } from './effects-lifecycle.cases';

describe('effect lifecycle conformance', () => runScenarios(EFFECT_LIFECYCLE_CASES));

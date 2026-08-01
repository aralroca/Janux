import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { EFFECT_TRACKING_CASES } from './effects-tracking.cases';

describe('effect dependency tracking conformance', () => runScenarios(EFFECT_TRACKING_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SIGNAL_COMPOSITION_CASES } from './signal-composition.cases';

describe('signal-composition conformance', () => runScenarios(SIGNAL_COMPOSITION_CASES));

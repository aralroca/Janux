import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SIGNAL_CASES } from './signals.cases';

describe('signals conformance', () => runScenarios(SIGNAL_CASES));

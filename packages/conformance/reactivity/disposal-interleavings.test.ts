import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { DISPOSAL_INTERLEAVING_CASES } from './disposal-interleavings.cases';

describe('disposal-interleavings conformance', () => runScenarios(DISPOSAL_INTERLEAVING_CASES));

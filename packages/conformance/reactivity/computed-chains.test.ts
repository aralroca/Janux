import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { COMPUTED_CHAIN_CASES } from './computed-chains.cases';

describe('computed chain conformance', () => runScenarios(COMPUTED_CHAIN_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { STATE_MACHINE_PATTERN_CASES } from './patterns-state-machines.cases';

describe('patterns-state-machines conformance', () => runScenarios(STATE_MACHINE_PATTERN_CASES));

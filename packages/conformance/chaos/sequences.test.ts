import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CHAOS_SEQUENCE_CASES } from './sequences.cases';

describe('random sequences, checked against invariants', () => runScenarios(CHAOS_SEQUENCE_CASES));

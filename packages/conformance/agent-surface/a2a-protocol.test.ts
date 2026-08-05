import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { A2A_PROTOCOL_CASES } from './a2a-protocol.cases';

describe('hosted A2A protocol', () => runScenarios(A2A_PROTOCOL_CASES));

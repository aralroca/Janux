import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { OWNERSHIP_TRANSFER_CASES } from './ownership-transfer.cases';

describe('ownership-transfer conformance', () => runScenarios(OWNERSHIP_TRANSFER_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PLAIN_DATA_CASES } from './plain-data.cases';

describe('plain data boundary conformance', () => runScenarios(PLAIN_DATA_CASES));

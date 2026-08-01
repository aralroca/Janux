import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { ISLAND_SHARING_CASES } from './islands-sharing.cases';

describe('islands-sharing conformance', () => runScenarios(ISLAND_SHARING_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { BACKPRESSURE_CASES } from './backpressure.cases';

describe('the response body as a pulled stream', () => runScenarios(BACKPRESSURE_CASES));

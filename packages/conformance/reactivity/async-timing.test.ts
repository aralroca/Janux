import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { ASYNC_TIMING_CASES } from './async-timing.cases';

describe('async-timing conformance', () => runScenarios(ASYNC_TIMING_CASES));

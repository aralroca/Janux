import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { WORKER_CASES } from './worker.cases';

describe('worker(): the thread boundary', () => runScenarios(WORKER_CASES));

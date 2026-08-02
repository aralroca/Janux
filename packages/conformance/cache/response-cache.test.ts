import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { RESPONSE_CACHE_CASES } from './response-cache.cases';

describe('http response cache', () => runScenarios(RESPONSE_CACHE_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { QUERY_STREAM_CASES } from './query-stream.cases';

describe('query hydration across the chunks of one response', () => runScenarios(QUERY_STREAM_CASES));

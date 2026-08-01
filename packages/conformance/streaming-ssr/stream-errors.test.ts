import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { STREAM_ERROR_CASES } from './stream-errors.cases';

describe('what a failure does to a page that is already going out', () => runScenarios(STREAM_ERROR_CASES));

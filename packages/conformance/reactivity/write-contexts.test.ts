import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { WRITE_CONTEXT_CASES } from './write-contexts.cases';

describe('write-contexts conformance', () => runScenarios(WRITE_CONTEXT_CASES));

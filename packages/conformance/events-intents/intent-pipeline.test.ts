import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { INTENT_PIPELINE_CASES } from './intent-pipeline.cases';

describe('intent pipeline conformance', () => runScenarios(INTENT_PIPELINE_CASES));

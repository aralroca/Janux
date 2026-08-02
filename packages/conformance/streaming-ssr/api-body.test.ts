import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { API_BODY_CASES } from './api-body.cases';

describe('the size ceiling on invocation request bodies', () => runScenarios(API_BODY_CASES));

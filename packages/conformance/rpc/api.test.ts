import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { API_CASES } from './api.cases';

describe('api() pipeline', () => runScenarios(API_CASES));

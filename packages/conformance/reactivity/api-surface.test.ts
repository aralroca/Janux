import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { API_SURFACE_CASES } from './api-surface.cases';

describe('api-surface conformance', () => runScenarios(API_SURFACE_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MD_PROJECTION_CASES } from './md-projection.cases';

describe('markdown projection', () => runScenarios(MD_PROJECTION_CASES));

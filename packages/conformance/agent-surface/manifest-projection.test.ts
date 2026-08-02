import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MANIFEST_PROJECTION_CASES } from './manifest-projection.cases';

describe('manifest projection', () => runScenarios(MANIFEST_PROJECTION_CASES));

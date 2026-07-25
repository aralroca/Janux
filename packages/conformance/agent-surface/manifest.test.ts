import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MANIFEST_CASES } from './manifest.cases';

describe('manifest', () => runScenarios(MANIFEST_CASES));

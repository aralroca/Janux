import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CONFLICT_CASES } from './route-conflicts.cases';

describe('conflicting route trees', () => runScenarios(CONFLICT_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SNAPSHOT_CASES } from './snapshot.cases';

describe('resume from a snapshot', () => runScenarios(SNAPSHOT_CASES));

import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { RESUME_SCHEMA_CASES } from './morph-resume-schema.cases';

describe('resume from a snapshot: kind by kind', () => runScenarios(RESUME_SCHEMA_CASES));

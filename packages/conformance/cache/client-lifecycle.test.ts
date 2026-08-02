import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CLIENT_LIFECYCLE_CASES } from './client-lifecycle.cases';

describe('query client lifecycle', () => runScenarios(CLIENT_LIFECYCLE_CASES));

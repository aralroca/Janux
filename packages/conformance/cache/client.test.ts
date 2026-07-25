import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CLIENT_CASES } from './client.cases';

describe('query client', () => runScenarios(CLIENT_CASES));

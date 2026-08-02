import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { AGENT_AUTH_CASES } from './agent-auth.cases';

describe('agent identity', () => runScenarios(AGENT_AUTH_CASES));

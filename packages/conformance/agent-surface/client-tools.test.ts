import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { CLIENT_TOOLS_CASES } from './client-tools.cases';

describe('client tools and tool selection', () => runScenarios(CLIENT_TOOLS_CASES));

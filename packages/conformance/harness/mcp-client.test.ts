import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MCP_CLIENT_CASES } from './mcp-client.cases';

describe('outbound MCP client', () => runScenarios(MCP_CLIENT_CASES));

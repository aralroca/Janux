import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { MCP_PROTOCOL_CASES } from './mcp-protocol.cases';

describe('hosted MCP protocol', () => runScenarios(MCP_PROTOCOL_CASES));
